/**
 * Axios interceptors for the API client.
 *
 * - Request: auth token injection
 * - Response: 401 handling with automatic token refresh
 */

import axios, { AxiosError, AxiosRequestConfig, AxiosInstance } from 'axios';
import type { ApiResponse } from '@read-pal/shared';
import {
  getAuthToken,
  getAuthTokenAsync,
  getRefreshToken,
  getRefreshTokenAsync,
  setAuthTokens,
} from '@/lib/auth-fetch';
import { isCapacitor } from '@/lib/capacitor';

const NON_CRITICAL_PREFIXES = [
  '/api/notifications',
  '/api/discovery',
  '/api/challenges',
  '/api/recommendations',
];

const REFRESH_URL = '/api/auth/refresh';

export function installRequestInterceptor(client: AxiosInstance): void {
  client.interceptors.request.use(
    async (config) => {
      const token = isCapacitor()
        ? await getAuthTokenAsync()
        : getAuthToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: unknown) => Promise.reject(error),
  );
}

export function installResponseInterceptor(client: AxiosInstance): void {
  // Token refresh state — prevents concurrent refresh calls
  let refreshPromise: Promise<boolean> | null = null;

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiResponse>) => {
      const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

      // Only handle 401 in browser
      if (typeof window === 'undefined' || error.response?.status !== 401) {
        return Promise.reject(error);
      }

      // Don't retry refresh endpoint itself
      if (originalRequest.url === REFRESH_URL) {
        return Promise.reject(error);
      }

      // Don't retry already retried requests
      if (originalRequest._retry) {
        return handleExpiredSession(error, NON_CRITICAL_PREFIXES);
      }

      // Check if the error code indicates an expired token (vs. invalid/unauthorized)
      const errorCode = (error.response?.data as { error?: { code?: string } })?.error?.code;
      if (errorCode !== 'TOKEN_EXPIRED' && errorCode !== 'TOKEN_REVOKED') {
        return handleExpiredSession(error, NON_CRITICAL_PREFIXES);
      }

      // Attempt refresh
      originalRequest._retry = true;

      const refreshed = await tryRefreshToken();
      if (!refreshed) {
        return handleExpiredSession(error, NON_CRITICAL_PREFIXES);
      }

      // Retry original request with new token
      const newToken = isCapacitor() ? await getAuthTokenAsync() : getAuthToken();
      if (newToken && originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
      }
      return client.request(originalRequest);
    },
  );

  /** Attempt to refresh the access token using the stored refresh token. */
  async function tryRefreshToken(): Promise<boolean> {
    if (refreshPromise) return refreshPromise;

    refreshPromise = doRefresh();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function doRefresh(): Promise<boolean> {
    const refreshToken = isCapacitor()
      ? await getRefreshTokenAsync()
      : getRefreshToken();

    if (!refreshToken) return false;

    try {
      const response = await client.post<ApiResponse<{ token: string; refreshToken: string }>>(
        '/api/auth/refresh',
        { refreshToken },
      );
      if (response.data.success && response.data.data) {
        setAuthTokens(response.data.data.token, response.data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

/** Handle a definitively expired/invalid session — clear storage and redirect. */
function handleExpiredSession(
  error: AxiosError<ApiResponse>,
  nonCriticalPrefixes: string[],
): Promise<never> {
  if (
    !window.location.pathname.includes('/auth') &&
    !window.location.pathname.includes('/login') &&
    !window.location.pathname.includes('/register') &&
    !window.location.pathname.includes('/welcome') &&
    !nonCriticalPrefixes.some((p) => error.config?.url?.startsWith(p))
  ) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    const locale = window.location.pathname.split('/')[1] || 'en';
    window.location.href = `/${locale}/auth?mode=login`;
  }
  return Promise.reject(error);
}
