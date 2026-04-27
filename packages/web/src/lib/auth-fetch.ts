/**
 * Auth-aware Fetch Utilities
 *
 * SSR-safe helpers for getting auth tokens and making
 * authenticated fetch requests. Use for SSE streaming and
 * other raw-fetch scenarios where the axios API client
 * cannot be used.
 */

import { getItem } from './native-storage';
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

/** Create headers with Content-Type and optional Bearer token (sync). */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { ...headers, ...extra };
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
