/** Pure API-client primitives shared across clients (M4c-1).
 *
 * The 401-refresh / interceptor / offline-queue wiring stays per-platform
 * (M4c-2, deliberate): web and mobile forked those behaviors. These pure
 * functions have zero platform coupling, so they live here.
 */

export const MAX_RETRIES = 3;
export const BASE_DELAY_MS = 1_000;

export const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

export function isRetryableStatus(status?: number): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter: attempt 1 → ~1s, 2 → ~2s, 3 → ~4s.
 * Deterministic base + ±30% jitter so tests can pin the base. */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const baseDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  return baseDelay + random() * baseDelay * 0.3;
}

/** Deterministic cache key for a request (method-less GET semantics):
 * url + sorted-JSON params. Shared so the per-platform caches key
 * identically for the same logical request. */
export function deriveCacheKey(url: string, params?: Record<string, unknown>): string {
  return `${url}:${stableStringify(params ?? {})}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}
