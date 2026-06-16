/**
 * Idempotency key generation for API requests.
 *
 * Two strategies:
 * - **Deterministic** for non-streaming mutations: SHA-256 (method + url +
 *   body) truncated to 32 hex. Same body → same key → server-side dedup
 *   catches double-click and network replays. Without determinism, two
 *   clicks generate two distinct UUIDs and the server can't tell they're
 *   the same logical operation.
 * - **Random** for streaming mutations: a fresh UUID per click. Streaming
 *   endpoints only need dedup WITHIN a single in-flight call (network retry
 *   with the same fetch); after completion a fresh UUID lets the user
 *   intentionally re-submit (e.g. regenerate wants a NEW response even
 *   though the body is identical to the prior regenerate).
 *
 * Server-side the key is validated against UUID or 32-char hex
 * (`app/middleware/idempotency.py:_KEY_PATTERN`). Both helpers emit 32-char
 * hex to keep the form uniform.
 */

let _subtleDigestAvailable: boolean | null = null;

async function sha256Hex(input: string): Promise<string> {
  if (_subtleDigestAvailable === null) {
    _subtleDigestAvailable =
      typeof crypto !== 'undefined' &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.digest === 'function';
  }
  if (_subtleDigestAvailable) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Sync fallback: two FNV-1a 32-bit passes with different seeds + mixed
  // products — collision domain is ~64 bits which is plenty for request
  // body hashing at our scale.
  let h1 = 0x811c9dc5 ^ input.length;
  let h2 = 0x1000193 ^ Math.imul(input.length, 31);
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + 0x9e), 0x85ebca77);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, '0') +
    (Math.imul(h2, h1 ^ 0x5bd1e995) >>> 0).toString(16).padStart(8, '0')
  );
}

/**
 * Deterministic idempotency key for non-streaming mutations.
 *
 * Use for POST/PUT/PATCH to LLM-backed endpoints (chat, summarize, explain,
 * discussion-questions, mood/scene, reading-plan). The server dedupes by
 * (user_id, idempotency_key), so two clicks on the same button collapse
 * into one LLM call.
 */
export async function deterministicIdempotencyKey(
  method: string,
  url: string,
  data?: unknown,
): Promise<string> {
  const body = data === undefined ? '' : JSON.stringify(data);
  return (await sha256Hex(`${method.toUpperCase()}\n${url}\n${body}`)).slice(0, 32);
}

/**
 * Random idempotency key for streaming mutations.
 *
 * Each logical call site generates a fresh key. Network retries within one
 * logical call MUST reuse the same key — generate once and pass it through
 * the retry loop, do not regenerate per attempt.
 */
export function randomIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    // Strip dashes — server accepts UUID or 32-char hex; we normalize to
    // 32-hex so callers don't need to care which form was produced.
    return crypto.randomUUID().replace(/-/g, '');
  }
  const arr = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4 variant bits — not strictly required by server, but tidy.
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
