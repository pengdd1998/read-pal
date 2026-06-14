/**
 * Auth-aware Fetch Utilities
 *
 * SSR-safe helpers for getting auth tokens and making
 * authenticated fetch requests. Use for SSE streaming and
 * other raw-fetch scenarios where the axios API client
 * cannot be used.
 */

import { getItem, setItem, removeItem } from './native-storage';
import { isCapacitor } from './capacitor';
import { safeGetItem, safeSetItem, safeRemoveItem } from './safe-storage';
import { warn } from './logger';

/** Get the auth token from localStorage (SSR-safe, synchronous). */
export function getAuthToken(): string | null {
  return typeof window !== 'undefined' ? safeGetItem('auth_token') : null;
}

/**
 * Decode a JWT's `exp` (seconds since epoch) without verifying the signature.
 * Returns null if the token isn't a parseable JWT.
 */
function decodeJwtExp(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * True if the access token is expired or about to expire within `leewayMs`.
 * Used to proactively refresh before a request instead of eating a 401 +
 * refresh-and-retry round-trip on every cold load.
 */
export function isTokenExpiring(token: string | null, leewayMs = 30_000): boolean {
  if (!token) return false;
  const exp = decodeJwtExp(token);
  if (exp === null) return false; // unparseable — let the request ride
  return Date.now() + leewayMs >= exp * 1000;
}

/** Get the auth token from native storage when in Capacitor (async). */
export async function getAuthTokenAsync(): Promise<string | null> {
  if (isCapacitor()) return getItem('auth_token');
  return getAuthToken();
}

/** Get the refresh token from localStorage (SSR-safe, synchronous). */
function getRefreshToken(): string | null {
  return typeof window !== 'undefined' ? safeGetItem('refresh_token') : null;
}

/** Get the refresh token from native storage when in Capacitor (async). */
async function getRefreshTokenAsync(): Promise<string | null> {
  if (isCapacitor()) return getItem('refresh_token');
  return getRefreshToken();
}

/** Store both access and refresh tokens. */
export async function setAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setItem('auth_token', accessToken);
  await setItem('refresh_token', refreshToken);
  if (typeof window !== 'undefined') {
    safeSetItem('auth_token', accessToken);
    safeSetItem('refresh_token', refreshToken);
  }
}

/** Clear both access and refresh tokens. */
export async function clearAuthTokens(): Promise<void> {
  await removeItem('auth_token');
  await removeItem('refresh_token');
  if (typeof window !== 'undefined') {
    safeRemoveItem('auth_token');
    safeRemoveItem('refresh_token');
  }
}

/** Create headers with auth token (async, uses native storage in Capacitor). */
async function authHeadersAsync(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = await getAuthTokenAsync();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { ...headers, ...extra };
}

/** Fetch wrapper that auto-injects auth headers (async for Capacitor support). */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const extraHeaders = (init?.headers instanceof Headers)
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined) ?? {};
  const headers = await authHeadersAsync(extraHeaders);
  return fetch(url, { ...init, headers });
}

/**
 * Auth-aware fetch with automatic token refresh on 401.
 * Use for SSE streaming and other raw-fetch scenarios where the Axios
 * interceptor is not available.
 */
export async function authFetchWithRefresh(url: string, init?: RequestInit): Promise<Response> {
  const response = await authFetch(url, init);

  if (response.status !== 401) return response;

  // Try to refresh the token
  const refreshed = await tryFetchRefresh();
  if (!refreshed) return response; // Return original 401

  // Retry with new token
  return authFetch(url, init);
}

// Shared refresh lock — prevents concurrent refresh calls across both
// the Axios interceptor and raw-fetch paths.
let _refreshPromise: Promise<boolean> | null = null;

/** Attempt to refresh tokens using the stored refresh token (shared, deduplicated). */
export async function tryFetchRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = doRefresh();
  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = isCapacitor() ? await getRefreshTokenAsync() : getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result.success && result.data) {
      await setAuthTokens(result.data.token, result.data.refreshToken);
      if (typeof document !== 'undefined') {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_token=${result.data.token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
      }
      return true;
    }
    return false;
  } catch (err) {
    warn('Token refresh failed:', err);
    return false;
  }
}
