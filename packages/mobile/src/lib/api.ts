/**
 * API Client for React Native
 *
 * Adapted from web/src/lib/api.ts:
 * - Removed SSR guards, Capacitor checks
 * - Uses SecureStore for token persistence
 * - Keeps retry logic, request deduplication, cache invalidation
 * - TanStack Query handles SWR — simplified cache here
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@read-pal/shared';
import { deterministicIdempotencyKey } from '@read-pal/shared';
import { getToken, deleteToken, getRefreshToken, saveToken, saveRefreshToken, deleteRefreshToken } from './auth-storage';
import { API_URL } from './env';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

const IDEMPOTENT_CAPABLE_METHODS = new Set(['post', 'put', 'patch']);

function isRetryableStatus(status?: number): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiClient {
  private client: AxiosInstance;
  private cache = new Map<string, { data: unknown; expiry: number }>();
  private inFlightRequests = new Map<string, Promise<unknown>>();
  private static MAX_CACHE_SIZE = 200;
  private refreshPromise: Promise<boolean> | null = null;

  private static REFRESH_URL = '/api/auth/refresh';

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    });

    // Attach auth token to every request, plus deterministic Idempotency-Key
    // on mutations so a double-click collapses to one server-side operation.
    this.client.interceptors.request.use(
      async (config) => {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        const method = (config.method || 'get').toLowerCase();
        const existingKey = (config.headers as Record<string, string> | undefined)?.['Idempotency-Key'];
        if (IDEMPOTENT_CAPABLE_METHODS.has(method) && !existingKey && config.url) {
          try {
            const key = await deterministicIdempotencyKey(method, config.url, config.data);
            // Set the single header on the existing AxiosHeaders instance —
            // reassigning a plain object loses the instance methods (TS2322).
            config.headers.set('Idempotency-Key', key);
          } catch {
            // Best-effort — never block the request on key generation.
          }
        }
        return config;
      },
      (error: unknown) => Promise.reject(error),
    );

    // Handle 401 with automatic token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiResponse>) => {
        if (error.response?.status !== 401) {
          return Promise.reject(error);
        }

        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // Don't retry the refresh endpoint itself
        if (originalRequest.url === ApiClient.REFRESH_URL) {
          await this.clearAuth();
          return Promise.reject(error);
        }

        // Only retry once
        if (originalRequest._retry) {
          await this.clearAuth();
          return Promise.reject(error);
        }

        // Check if this is an expired token error (vs invalid/other 401)
        const errorCode = (error.response?.data as { error?: { code?: string } })?.error?.code;
        if (errorCode !== 'TOKEN_EXPIRED' && errorCode !== 'TOKEN_REVOKED') {
          await this.clearAuth();
          return Promise.reject(error);
        }

        originalRequest._retry = true;
        const refreshed = await this.tryRefreshToken();

        if (!refreshed) {
          await this.clearAuth();
          return Promise.reject(error);
        }

        // Retry with new token
        const newToken = await getToken();
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return this.client.request(originalRequest);
      },
    );
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this._doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<boolean> {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await this.client.post<ApiResponse<{ token: string; refreshToken: string }>>(
        ApiClient.REFRESH_URL,
        { refreshToken },
      );
      if (response.data.success && response.data.data) {
        await saveToken(response.data.data.token);
        await saveRefreshToken(response.data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async clearAuth(): Promise<void> {
    await deleteToken();
    await deleteRefreshToken();
  }

  private async requestWithRetry<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const canRetry = RETRYABLE_METHODS.has(method);
    let lastError: unknown;
    const attempts = canRetry ? MAX_RETRIES : 1;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.client.request<T>({ ...config, method, url });
        return response.data;
      } catch (err: unknown) {
        lastError = err;
        const axiosErr = axios.isAxiosError(err) ? err : null;
        const isNetworkError = axiosErr ? !axiosErr.response : true;
        const status = axiosErr?.response?.status;
        const shouldRetry = canRetry && (isNetworkError || isRetryableStatus(status));

        if (!shouldRetry || attempt >= attempts) break;

        const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseDelay * 0.3;
        await sleep(baseDelay + jitter);
      }
    }

    throw lastError;
  }

  private pruneStaleEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) this.cache.delete(key);
    }
    if (this.cache.size > ApiClient.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.cache.keys())
        .slice(0, this.cache.size - ApiClient.MAX_CACHE_SIZE);
      for (const key of keysToDelete) this.cache.delete(key);
    }
  }

  invalidateCache(prefix?: string): void {
    if (!prefix) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private invalidateAfterMutation(url: string): void {
    if (url.includes('/api/books') || url.includes('/api/annotations') || url.includes('/api/reading-sessions')) {
      this.invalidateCache('/api/stats');
      this.invalidateCache('/api/books');
    }
    const prefixes = url.split('/').slice(0, 4).join('/');
    this.invalidateCache(prefixes);
    if (url.includes('/api/settings')) {
      this.invalidateCache('/api/settings');
    }
  }

  private getCacheTTL(url: string): number {
    if (url.match(/\/api\/books\/[^?]/) && !url.includes('?')) return 300_000;
    if (url.includes('/content')) return 3_600_000;
    if (url.includes('/api/settings')) return 60_000;
    if (url.includes('/api/annotations')) return 15_000;
    if (url.includes('/api/reading-sessions')) return 15_000;
    if (url.includes('/api/books')) return 30_000;
    return 0;
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const ttl = this.getCacheTTL(url);
    this.pruneStaleEntries();
    const cacheKey = `${url}:${JSON.stringify(params ?? {})}`;
    const cached = this.cache.get(cacheKey);

    if (cached && ttl > 0 && Date.now() < cached.expiry) {
      return cached.data as ApiResponse<T>;
    }

    const inFlight = this.inFlightRequests.get(cacheKey) as Promise<ApiResponse<T>> | undefined;
    if (inFlight) return inFlight;

    const requestPromise = this.requestWithRetry<ApiResponse<T>>('get', url, { params })
      .then((data) => {
        if (data.success && ttl > 0) {
          this.cache.set(cacheKey, { data, expiry: Date.now() + ttl });
        }
        return data;
      })
      .catch((err: unknown) => {
        const axiosErr = axios.isAxiosError(err) ? err : null;
        const serverError = axiosErr?.response?.data as ApiResponse<T> | undefined;
        if (serverError?.error) return { success: false as const, error: serverError.error };
        const isNetwork = !axiosErr?.response;
        return {
          success: false as const,
          error: {
            code: isNetwork ? 'NETWORK_ERROR' : 'SERVER_ERROR',
            message: isNetwork ? 'Unable to connect to server. Check your network connection.' : 'Request failed',
          },
        };
      })
      .finally(() => { this.inFlightRequests.delete(cacheKey); });

    this.inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  private handleMutationError<T>(err: unknown): ApiResponse<T> {
    const axiosErr = axios.isAxiosError(err) ? err : null;
    const serverError = axiosErr?.response?.data as ApiResponse<T> | undefined;
    if (serverError?.error) return { success: false as const, error: serverError.error };
    const isNetwork = !axiosErr?.response;
    return {
      success: false as const,
      error: {
        code: isNetwork ? 'NETWORK_ERROR' : 'SERVER_ERROR',
        message: isNetwork ? 'Unable to connect to server. Check your network connection.' : 'Request failed',
      },
    };
  }

  async post<T>(url: string, data?: Record<string, unknown>, options?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('post', url, { data, ...options });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      return this.handleMutationError<T>(err);
    }
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('put', url, { data });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      return this.handleMutationError<T>(err);
    }
  }

  async patch<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('patch', url, { data });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      return this.handleMutationError<T>(err);
    }
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('delete', url);
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      return this.handleMutationError<T>(err);
    }
  }

  async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
  ): Promise<ApiResponse<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await this.client.post<ApiResponse<T>>(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total && onProgress) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        this.invalidateAfterMutation('/api/books');
        return response.data;
      } catch (err) {
        lastError = err;
        const status = (err as AxiosError).response?.status;
        if (!isRetryableStatus(status) && status) break;
        if (attempt < 2) await sleep(BASE_DELAY_MS);
      }
    }
    throw lastError;
  }
}

export const API_BASE_URL = API_URL;
export const api = new ApiClient();
