/** Forwarding module — retry primitives live in @read-pal/shared
 * (M4c-1) so any future client (mobile) shares the exact same policy. */

export {
  MAX_RETRIES,
  BASE_DELAY_MS,
  RETRYABLE_METHODS,
  backoffDelayMs,
  isRetryableStatus,
  sleep,
} from '@read-pal/shared/src/api-primitives';
