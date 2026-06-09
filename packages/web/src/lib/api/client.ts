/**
 * Core API client — HTTP client with retry, caching, deduplication, and offline support.
 *
 * Composed from:
 * - retry.ts — exponential backoff utilities
 * - cache.ts — per-endpoint TTL cache with stale-while-revalidate
 * - interceptors.ts — auth token injection and 401/refresh handling
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@read-pal/shared';
import { queueMutation } from '@/lib/offline-queue';
import { getAuthToken } from '@/lib/auth-fetch';
import { isCapacitor } from '@/lib/capacitor';
import { getCachedContent } from '@/lib/mobile-cache';

import {
  MAX_RETRIES,
  BASE_DELAY_MS,
  RETRYABLE_METHODS,
  isRetryableStatus,
  sleep,
} from './retry';

import {
  STALE_TTL,
  MAX_CACHE_SIZE,
  type CacheEntry,
  getCacheTTL,
  pruneStaleEntries,
  invalidateCache,
  invalidateAfterMutation,
} from './cache';

import {
  installRequestInterceptor,
  installResponseInterceptor,
} from './interceptors';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export class ApiClient {
  private client: AxiosInstance;
  private cache = new Map<string, CacheEntry>();
  private inFlightRequests = new Map<string, Promise<unknown>>();

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    installRequestInterceptor(this.client);
    installResponseInterceptor(this.client);
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

        const isNetworkError = axiosErr ? !axiosErr.response : true;
        const status = axiosErr?.response?.status;
        const shouldRetry = canRetry && (isNetworkError || isRetryableStatus(status));

        if (!shouldRetry || attempt >= attempts) {
          break;
        }

        const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * baseDelay * 0.3;
        await sleep(baseDelay + jitter);
      }
    }

    throw lastError;
  }

  /** Invalidate cache entries matching a prefix (e.g., '/api/settings' clears '/api/settings*') */
  invalidateCache(prefix?: string): void {
    invalidateCache(this.cache, prefix);
  }

  /**
   * GET request — returns { success: false } for HTTP errors instead of throwing.
   * Only throws on truly unexpected errors (e.g., request cancellation).
   */
  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const ttl = getCacheTTL(url);
    pruneStaleEntries(this.cache);
    const cacheKey = `${url}:${JSON.stringify(params ?? {})}`;
    const cached = this.cache.get(cacheKey);

    if (cached && ttl > 0) {
      const now = Date.now();
      if (cached.expiry > now) {
        return cached.data as ApiResponse<T>;
      }
      if (cached.expiry + STALE_TTL > now) {
        this.refreshInBackground(cacheKey, url, params, ttl);
        return cached.data as ApiResponse<T>;
      }
    }

    // Deduplicate concurrent identical requests
    const inFlight = this.inFlightRequests.get(cacheKey) as Promise<ApiResponse<T>> | undefined;
    if (inFlight) return inFlight;

    const bookContentMatch = url.match(/\/api\/upload\/books\/([^/]+)\/content/);

    const requestPromise = this.requestWithRetry<ApiResponse<T>>('get', url, { params })
      .then((data) => {
        if (data.success && ttl > 0) {
          this.cache.set(cacheKey, { data, expiry: Date.now() + ttl });
        }
        return data;
      })
      .catch(async (err: unknown) => {
        if (isCapacitor() && bookContentMatch && typeof window !== 'undefined' && !navigator.onLine) {
          const cachedBook = await getCachedContent(bookContentMatch[1]);
          if (cachedBook) {
            return {
              success: true as const,
              data: {
                book: { title: cachedBook.bookTitle },
                chapters: cachedBook.chapters,
              } as unknown as T,
            };
          }
        }
        const axiosErr = axios.isAxiosError(err) ? err : null;
        const serverError = axiosErr?.response?.data as ApiResponse<T> | undefined;
        if (serverError?.error) {
          return { success: false as const, error: serverError.error };
        }
        return { success: false as const, error: { code: 'NETWORK_ERROR', message: 'Request failed' } };
      })
      .finally(() => {
        this.inFlightRequests.delete(cacheKey);
      });

    this.inFlightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  /** Background revalidation — updates cache without blocking UI */
  private refreshInBackground<T>(cacheKey: string, url: string, params?: Record<string, unknown>, ttl?: number): void {
    this.requestWithRetry<ApiResponse<T>>('get', url, { params })
      .then((data) => {
        if (data.success) {
          const cacheTtl = ttl ?? getCacheTTL(url);
          this.cache.set(cacheKey, { data, expiry: Date.now() + cacheTtl });
        }
      })
      .catch(() => {
        console.warn("api: background refresh failed");
        // Background refresh failed — stale data remains usable
      });
  }

  /** Shared mutation logic for post/put/patch/delete */
  private async _mutation<T>(
    method: 'post' | 'put' | 'patch' | 'delete',
    url: string,
    data?: Record<string, unknown>,
    options?: AxiosRequestConfig,
  ): Promise<ApiResponse<T>> {
    try {
      const result = await this.requestWithRetry<ApiResponse<T>>(method, url, { data, ...options });
      invalidateAfterMutation(this.cache, url);
      return result;
    } catch (err) {
      if (this.isOfflineError(err)) {
        console.warn('API client: request failed (offline queue)', err);
        return this.queueOfflineResponse<T>(url, method.toUpperCase(), data);
      }
      throw err;
    }
  }

  async post<T>(url: string, data?: Record<string, unknown>, options?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this._mutation<T>('post', url, data, options);
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this._mutation<T>('put', url, data);
  }

  async patch<T>(url: string, data?: Record<string, unknown>, options?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this._mutation<T>('patch', url, data, options);
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    return this._mutation<T>('delete', url);
  }

  /** Check if an error is due to being offline */
  private isOfflineError(err: unknown): boolean {
    if (typeof window !== 'undefined' && !navigator.onLine) return true;
    if (axios.isAxiosError(err)) return !err.response;
    return true;
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

  /** Upload a file (FormData) to a given endpoint, with optional progress callback and abort support. */
  async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<ApiResponse<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
      try {
        const response = await this.client.post<ApiResponse<T>>(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal,
          onUploadProgress: (e) => {
            if (e.total && onProgress) {
              onProgress(Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        invalidateAfterMutation(this.cache, '/api/books');
        return response.data;
      } catch (err) {
        if (signal?.aborted || (err as DOMException)?.name === 'AbortError') {
          throw err;
        }
        console.warn('API client: retry failed', err);
        lastError = err;
        const status = (err as AxiosError).response?.status;
        if (!isRetryableStatus(status) && status) break;
        if (attempt < 2) await sleep(BASE_DELAY_MS);
      }
    }
    throw lastError;
  }
}

/** Base URL of the backend API (useful for raw fetch calls) */
export const API_BASE_URL = API_URL;

/** Singleton API client instance */
export const api = new ApiClient();
