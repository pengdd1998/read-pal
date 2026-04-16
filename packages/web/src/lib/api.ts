/**
 * API Client Configuration
 *
 * SSR-safe: all browser APIs (localStorage, window) are guarded.
 *
 * Features:
 * - Automatic retry with exponential backoff for network / 5xx / 429 errors
 * - Stale-while-revalidate cache for GET requests
 * - Auth token injection and 401 redirect
 * - Request deduplication for concurrent identical GETs
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@read-pal/shared';
import { queueMutation } from '@/lib/offline-queue';
import { getAuthToken } from '@/lib/auth-fetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

function isRetryableStatus(status?: number): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiClient {
  private client: AxiosInstance;
  private cache = new Map<string, { data: unknown; expiry: number; stale?: boolean }>();
  private inFlightRequests = new Map<string, Promise<unknown>>();
  private static STALE_TTL = 300_000; // 5 minutes — serve stale while revalidating
  private static MAX_CACHE_SIZE = 200;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
    });

    // Request interceptor - attach auth token (browser only)
    this.client.interceptors.request.use(
      (config) => {
        const token = getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: unknown) => Promise.reject(error),
    );

    // Response interceptor - handle 401 (browser only)
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiResponse>) => {
        if (
          typeof window !== 'undefined' &&
          error.response?.status === 401 &&
          !window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/register')
        ) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Execute an axios request with automatic retry for idempotent methods.
   * Retries on: network errors (no response), HTTP 429, and 5xx.
   * Uses exponential backoff with jitter: 1s → 2s → 4s.
   */
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

        // Only retry on network errors or retryable status codes for idempotent methods
        const isNetworkError = axiosErr ? !axiosErr.response : true;
        const status = axiosErr?.response?.status;
        const shouldRetry = canRetry && (isNetworkError || isRetryableStatus(status));

        if (!shouldRetry || attempt >= attempts) {
          break;
        }

        // Exponential backoff with jitter
        const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseDelay * 0.3;
        await sleep(baseDelay + jitter);
      }
    }

    throw lastError;
  }

  /** Remove expired entries and enforce max cache size */
  private pruneStaleEntries(): void {
    const now = Date.now();
    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry + ApiClient.STALE_TTL) {
        this.cache.delete(key);
      }
    }
    // If still over max, remove oldest entries
    if (this.cache.size > ApiClient.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, this.cache.size - ApiClient.MAX_CACHE_SIZE);
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
    }
  }

  /** Invalidate cache entries matching a prefix (e.g., '/api/settings' clears '/api/settings*') */
  invalidateCache(prefix?: string): void {
    if (!prefix) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /** Invalidate cache entries related to a specific data change */
  private invalidateAfterMutation(url: string): void {
    // Clear all stats when books/annotations/sessions change
    if (url.includes('/api/books') || url.includes('/api/annotations') || url.includes('/api/reading-sessions')) {
      this.invalidateCache('/api/stats');
      this.invalidateCache('/api/challenges');
      this.invalidateCache('/api/recommendations');
    }
    // Clear specific data
    const prefixes = url.split('/').slice(0, 4).join('/'); // e.g., /api/books or /api/annotations
    this.invalidateCache(prefixes);
    // Settings changes
    if (url.includes('/api/settings')) {
      this.invalidateCache('/api/settings');
      this.invalidateCache('/api/stats');
    }
  }

  /** Return per-endpoint cache TTL in ms (0 = not cacheable) */
  private getCacheTTL(url: string): number {
    if (url.match(/\/api\/books\/[^?]/) && !url.includes('?')) return 300_000;      // Single book detail: 5 min
    if (url.includes('/content')) return 3_600_000;                                    // Chapter content: 1 hour
    if (url.includes('/api/settings')) return 60_000;                                   // Settings: 1 min
    if (url.includes('/api/stats/dashboard')) return 30_000;                           // Dashboard: 30s
    if (url.includes('/api/stats/reading-calendar')) return 60_000;                    // Calendar: 1 min
    if (url.includes('/api/stats')) return 30_000;                                     // Other stats: 30s
    if (url.includes('/api/annotations/tags')) return 120_000;                         // Tags: 2 min
    if (url.includes('/api/annotations')) return 15_000;                               // Annotations: 15s
    if (url.includes('/api/reading-sessions')) return 15_000;                          // Sessions: 15s
    if (url.includes('/api/agents/history')) return 60_000;                            // Chat history: 1 min
    if (url.includes('/api/challenges')) return 300_000;                               // Challenges: 5 min
    if (url.includes('/api/recommendations')) return 300_000;                          // Recommendations: 5 min
    if (url.includes('/api/books')) return 30_000;                                     // Book list: 30s
    if (url.includes('/api/discovery')) return 60_000;                                 // Discovery: 1 min
    if (url.includes('/api/friend/status')) return 60_000;                             // Friend status: 1 min
    return 0; // Not cacheable
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const ttl = this.getCacheTTL(url);
    this.pruneStaleEntries();
    const cacheKey = `${url}:${JSON.stringify(params ?? {})}`;
    const cached = this.cache.get(cacheKey);

    if (cached && ttl > 0) {
      const now = Date.now();
      if (cached.expiry > now) {
        return cached.data as ApiResponse<T>;
      }
      if (cached.expiry + ApiClient.STALE_TTL > now) {
        this.refreshInBackground(cacheKey, url, params, ttl);
        return cached.data as ApiResponse<T>;
      }
    }

    // Deduplicate concurrent identical requests
    const inFlight = this.inFlightRequests.get(cacheKey) as Promise<ApiResponse<T>> | undefined;
    if (inFlight) return inFlight;

    const requestPromise = this.requestWithRetry<ApiResponse<T>>('get', url, { params })
      .then((data) => {
        if (data.success && ttl > 0) {
          this.cache.set(cacheKey, { data, expiry: Date.now() + ttl });
        }
        return data;
      })
      .finally(() => {
        this.inFlightRequests.delete(cacheKey);
      });

    this.inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /** Background revalidation — updates cache without blocking UI, with retry */
  private refreshInBackground<T>(cacheKey: string, url: string, params?: Record<string, unknown>, ttl?: number): void {
    this.requestWithRetry<ApiResponse<T>>('get', url, { params })
      .then((data) => {
        if (data.success) {
          const cacheTtl = ttl ?? this.getCacheTTL(url);
          this.cache.set(cacheKey, { data, expiry: Date.now() + cacheTtl });
        }
      })
      .catch(() => {
        // Background refresh failed — stale data remains usable
      });
  }

  async post<T>(url: string, data?: Record<string, unknown>, options?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('post', url, { data, ...options });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      if (this.isOfflineError(err)) {
        return this.queueOfflineResponse<T>(url, 'POST', data);
      }
      throw err;
    }
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('put', url, { data });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      if (this.isOfflineError(err)) {
        return this.queueOfflineResponse<T>(url, 'PUT', data);
      }
      throw err;
    }
  }

  async patch<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('patch', url, { data });
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      if (this.isOfflineError(err)) {
        return this.queueOfflineResponse<T>(url, 'PATCH', data);
      }
      throw err;
    }
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>('delete', url);
      this.invalidateAfterMutation(url);
      return result;
    } catch (err) {
      if (this.isOfflineError(err)) {
        return this.queueOfflineResponse<T>(url, 'DELETE');
      }
      throw err;
    }
  }

  /** Check if an error is due to being offline */
  private isOfflineError(err: unknown): boolean {
    if (typeof window !== 'undefined' && !navigator.onLine) return true;
    if (axios.isAxiosError(err)) return !err.response;
    return true; // Non-axios errors are assumed network-level
  }

  /** Return a queued response that the caller can treat as success */
  private async queueOfflineResponse<T>(url: string, method: string, data?: unknown): Promise<ApiResponse<T>> {
    if (typeof window !== 'undefined') {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await queueMutation(url, method, data, headers);
    }
    return {
      success: true,
      data: undefined as unknown as T,
      error: undefined,
    };
  }

  /** Upload a file (FormData) to a given endpoint, with optional progress callback. Retries on network/5xx. */
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
        if (!isRetryableStatus(status) && status) break; // Only retry on network or 5xx
        if (attempt < 2) await sleep(BASE_DELAY_MS);
      }
    }
    throw lastError;
  }
}

/** Base URL of the backend API (useful for raw fetch calls) */
export const API_BASE_URL = API_URL;

export const api = new ApiClient();
