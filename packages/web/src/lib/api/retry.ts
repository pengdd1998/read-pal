/**
 * Retry utilities for API requests.
 *
 * Exponential backoff with jitter for network / 5xx / 429 errors.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

export { MAX_RETRIES, BASE_DELAY_MS };

export const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

export function isRetryableStatus(status?: number): boolean {
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
