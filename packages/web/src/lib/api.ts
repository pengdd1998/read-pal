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
  private cache = new Map<string, { data: unknown; expiry: number }>();
  private static DEFAULT_TTL = 30_000; // 30 seconds

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

  async get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const cacheKey = `${url}:${JSON.stringify(params ?? {})}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as ApiResponse<T>;
    }
    const response = await this.client.get<ApiResponse<T>>(url, { params });
    // Cache successful GET responses for settings/library-type endpoints
    if (response.data.success && (
      url.includes('/api/settings') ||
      url.includes('/api/stats/dashboard') ||
      url.includes('/api/agents/history')
    )) {
      this.cache.set(cacheKey, { data: response.data, expiry: Date.now() + ApiClient.DEFAULT_TTL });
    }
    return response.data;
  }

  async post<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    // Invalidate relevant caches on mutations
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    return response.data;
  }

  async put<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    return response.data;
  }

  async patch<T>(url: string, data?: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
    return response.data;
  }

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url);
    this.invalidateCache('/api/settings');
    this.invalidateCache('/api/stats');
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
