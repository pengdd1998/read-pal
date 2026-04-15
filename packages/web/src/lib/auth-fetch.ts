/**
 * Auth-aware Fetch Utilities
 *
 * SSR-safe helpers for getting auth tokens and making
 * authenticated fetch requests. Use for SSE streaming and
 * other raw-fetch scenarios where the axios API client
 * cannot be used.
 */

/** Get the auth token from localStorage (SSR-safe). */
export function getAuthToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
}

/** Create headers with Content-Type and optional Bearer token. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return { ...headers, ...extra };
}

/** Fetch wrapper that auto-injects auth headers. */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const extraHeaders = (init?.headers instanceof Headers)
    ? Object.fromEntries(init.headers.entries())
    : (init?.headers as Record<string, string> | undefined) ?? {};
  const headers = authHeaders(extraHeaders);
  return fetch(url, { ...init, headers });
}
