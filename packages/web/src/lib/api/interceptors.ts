/**
 * Axios interceptors for the API client.
 *
 * - Request: auth token injection
 * - Response: 401 handling with automatic token refresh
 */

import { AxiosError, AxiosRequestConfig, AxiosInstance } from 'axios';
import type { ApiResponse } from '@read-pal/shared';
import { deterministicIdempotencyKey } from '@read-pal/shared';
import {
  getAuthToken,
  getAuthTokenAsync,
  isTokenExpiring,
  tryFetchRefresh,
  clearAuthTokens,
} from '@/lib/auth-fetch';
import { isCapacitor } from '@/lib/capacitor';
import { safeRemoveItem } from '@/lib/safe-storage';

const NON_CRITICAL_PREFIXES = [
  '/api/notifications',
  '/api/discovery',
  '/api/challenges',
  '/api/recommendations',
];

const REFRESH_URL = '/api/auth/refresh';

// Methods that can safely carry a deterministic idempotency key. We exclude
// GET/HEAD/OPTIONS (no body to hash, and the cache layer handles dedup) and
// DELETE (semantics usually include "kill whatever is there", where a stale
// replayed 200 from a prior delete is harmless but could mask a follow-up
// create-then-delete sequence).
const IDEMPOTENT_CAPABLE_METHODS = new Set(['post', 'put', 'patch']);

export function installRequestInterceptor(client: AxiosInstance): void {
  client.interceptors.request.use(
    async (config) => {
      let token = isCapacitor()
        ? await getAuthTokenAsync()
        : getAuthToken();
      // Proactively refresh an expired/near-expiry access token BEFORE sending,
      // so a cold load doesn't fire N parallel requests that all 401 (each
      // then triggering the response-interceptor refresh-and-retry). The
      // shared _refreshPromise dedupes concurrent refreshes. Best-effort: if
      // refresh fails, fall through with the stale token and let the response
      // interceptor's 401 handling take over.
      if (token && isTokenExpiring(token) && config.url !== REFRESH_URL) {
        const refreshed = await tryFetchRefresh();
        if (refreshed) {
          token = isCapacitor() ? await getAuthTokenAsync() : getAuthToken();
        }
      }
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Auto-attach deterministic Idempotency-Key on mutations so a
      // double-click collapses to one server-side LLM call. Callers can
      // override by setting the header explicitly (e.g. streaming uses a
      // random UUID per click so regenerate can fire fresh after completion).
      const method = (config.method || 'get').toLowerCase();
      const existingKey = (config.headers as Record<string, string> | undefined)?.['Idempotency-Key'];
      if (IDEMPOTENT_CAPABLE_METHODS.has(method) && !existingKey && config.url) {
        try {
          const key = await deterministicIdempotencyKey(method, config.url, config.data);
          // Set the single header directly (same pattern as Authorization above)
          // rather than reassigning the whole AxiosRequestHeaders object, which
          // would lose the AxiosHeaders instance methods (set/get/has/delete).
          config.headers['Idempotency-Key'] = key;
        } catch {
          // Best-effort — never block the request on key generation.
        }
      }
      return config;
    },
    (error: unknown) => Promise.reject(error),
  );
}

export function installResponseInterceptor(client: AxiosInstance): void {
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

      // Only skip refresh for error codes that indicate auth is truly unrecoverable
      const errorCode = (error.response?.data as { error?: { code?: string } })?.error?.code;
      const unrecoverableCodes = ['INVALID_CREDENTIALS', 'ACCOUNT_DELETED', 'ACCOUNT_LOCKED'];
      if (unrecoverableCodes.includes(errorCode ?? '')) {
        return handleExpiredSession(error, NON_CRITICAL_PREFIXES);
      }

      // Attempt refresh using shared dedup mechanism
      originalRequest._retry = true;

      const refreshed = await tryFetchRefresh();
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
    clearAuthTokens();
    safeRemoveItem('user');
    if (typeof document !== 'undefined') {
      document.cookie = 'auth_token=; path=/; max-age=0';
    }
    const locale = window.location.pathname.split('/')[1] || 'en';
    window.location.href = `/${locale}/auth?mode=login`;
  }
  return Promise.reject(error);
}
