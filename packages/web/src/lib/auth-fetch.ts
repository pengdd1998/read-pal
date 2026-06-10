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

/** Get the auth token from localStorage (SSR-safe, synchronous). */
export function getAuthToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
}

/** Get the auth token from native storage when in Capacitor (async). */
export async function getAuthTokenAsync(): Promise<string | null> {
  if (isCapacitor()) return getItem('auth_token');
  return getAuthToken();
}

/** Get the refresh token from localStorage (SSR-safe, synchronous). */
export function getRefreshToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;
}

/** Get the refresh token from native storage when in Capacitor (async). */
export async function getRefreshTokenAsync(): Promise<string | null> {
  if (isCapacitor()) return getItem('refresh_token');
  return getRefreshToken();
}

/** Store both access and refresh tokens. */
export async function setAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setItem('auth_token', accessToken);
  await setItem('refresh_token', refreshToken);
  if (typeof window !== 'undefined') {
    localStorage.setItem('auth_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
  }
}

/** Clear both access and refresh tokens. */
export async function clearAuthTokens(): Promise<void> {
  await removeItem('auth_token');
  await removeItem('refresh_token');
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
  }
}

/** Create headers with Content-Type and optional Bearer token (sync).
 *  For web (non-Capacitor), auth is cookie-based — no Bearer header needed. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isCapacitor()) {
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return { ...headers, ...extra };
}

/** Create headers with auth token (async, uses native storage in Capacitor).
 *  For web, auth is cookie-based — no Bearer header needed. */
async function authHeadersAsync(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isCapacitor()) {
    const token = await getAuthTokenAsync();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return { ...headers, ...extra };
}

/** Fetch wrapper that auto-injects auth headers and sends cookies.
 *  Web: cookies are sent automatically (credentials: 'include').
 *  Mobile: Bearer token in header. */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const extraHeaders = (init?.headers instanceof Headers)
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined) ?? {};
  const headers = await authHeadersAsync(extraHeaders);
  return fetch(url, { ...init, headers, credentials: 'include' });
}
