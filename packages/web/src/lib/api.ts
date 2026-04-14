/**
 * API Client Configuration
 *
 * SSR-safe: all browser APIs (localStorage, window) are guarded.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type { ApiResponse } from '@read-pal/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

class ApiClient {
  private client: AxiosInstance;
  private cache = new Map<string, { data: unknown; expiry: number; stale?: boolean }>();
  private static DEFAULT_TTL = 30_000; // 30 seconds
  private static STALE_TTL = 300_000; // 5 minutes — serve stale while revalidating

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
        if (typeof window !== 'undefined') {
          const token = localStorage.getItem('auth_token');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
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

  /** Invalidate cache entries matching a prefix (e.g., '/api/settings' clears '/api/settings*') */
  invalidateCache(prefix?: string): void {
    if (!prefix) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /** Check if a URL should be cached client-side */
  private isCacheable(url: string): boolean {
    return url.includes('/api/settings') ||
      url.includes('/api/stats/dashboard') ||
      url.includes('/api/stats/reading-calendar') ||
      url.includes('/api/agents/history') ||
      url.includes('/api/books?') ||
      url.includes('/api/recommendations') ||
      url.includes('/api/challenges');
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const cacheKey = `${url}:${JSON.stringify(params ?? {})}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      const now = Date.now();
      if (cached.expiry > now) {
        // Fresh cache — return immediately
        return cached.data as ApiResponse<T>;
      }
      if (cached.expiry + ApiClient.STALE_TTL > now) {
        // Stale-while-revalidate: return stale data, refresh in background
        this.refreshInBackground(cacheKey, url, params);
        return cached.data as ApiResponse<T>;
      }
    }

    // No cache or fully expired — fetch fresh
    const response = await this.client.get<ApiResponse<T>>(url, { params });
    if (response.data.success && this.isCacheable(url)) {
      this.cache.set(cacheKey, { data: response.data, expiry: Date.now() + ApiClient.DEFAULT_TTL });
    }
    return response.data;
  }

  /** Background revalidation — updates cache without blocking UI */
  private refreshInBackground<T>(cacheKey: string, url: string, params?: Record<string, unknown>): void {
    this.client.get<ApiResponse<T>>(url, { params }).then((response) => {
      if (response.data.success) {
        this.cache.set(cacheKey, { data: response.data, expiry: Date.now() + ApiClient.DEFAULT_TTL });
      }
    }).catch(() => {
      // Background refresh failed — stale data remains usable
    });
  }

  async post<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    this.invalidateCache('/api/books');
    this.invalidateCache('/api/recommendations');
    this.invalidateCache('/api/challenges');
    return response.data;
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    this.invalidateCache('/api/books');
    return response.data;
  }

  async patch<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    this.invalidateCache('/api/books');
    return response.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    this.invalidateCache('/api/books');
    this.invalidateCache('/api/annotations');
    return response.data;
  }

  /** Upload a file (FormData) to a given endpoint, with optional progress callback */
  async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
  ): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
    return response.data;
  }
}

/** Base URL of the backend API (useful for raw fetch calls) */
export const API_BASE_URL = API_URL;

export const api = new ApiClient();
