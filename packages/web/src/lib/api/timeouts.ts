/**
 * Per-endpoint timeout policy for the API client.
 *
 * AI-backed endpoints (LLM generation with retries + provider failover)
 * routinely take 40-120s server-side: the primary GLM provider can sit in
 * retry/backoff for ~45s before failing over to the backup provider, and
 * memory-book generation fans out 10 LLM calls. The client default (15s)
 * aborted these requests while the server was still working — the user saw
 * "Failed to generate" for features that actually succeeded server-side.
 *
 * Keep this list in sync with slow (LLM-backed) POST endpoints.
 */

/** Default timeout for ordinary CRUD endpoints (ms). */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Timeout for AI generation endpoints (ms) — must exceed the worst-case
 *  server path: glm retries (~45s) + mimo fallback (~40s) + provider
 *  failover chain + persist. 3 minutes gives headroom without hanging the
 *  UI forever. */
export const AI_TIMEOUT_MS = 180_000;

/** Timeout for full-book content fetches (ms). Real multi-MB books
 *  (e.g. 红楼梦, 2.7 MB JSON) take 13–21s server-side; the 15s default
 *  aborted the request and the reader rendered permanently blank —
 *  found by the real-book E2E matrix (UI-R-01). */
export const BOOK_CONTENT_TIMEOUT_MS = 60_000;

const AI_ENDPOINT_PATTERNS: RegExp[] = [
  /\/api\/agent\/reading-plan/,       // plan generation + advance
  /\/api\/reading-book\/generate/,    // memory-book pipeline (10 sections)
  /\/api\/flashcards\/generate/,      // flashcard generation
  /\/api\/synthesis/,                 // cross-book + single-book analysis
  /\/api\/knowledge\/graph\//,        // knowledge extraction
  /\/api\/agent\/mood\//,             // mood scene generation
];

const BOOK_CONTENT_PATTERN = /\/api\/upload\/books\/[^/]+\/content/;

/** Return the request timeout for an endpoint (ms). */
export function getTimeoutForUrl(url: string): number {
  if (BOOK_CONTENT_PATTERN.test(url)) return BOOK_CONTENT_TIMEOUT_MS;
  for (const pattern of AI_ENDPOINT_PATTERNS) {
    if (pattern.test(url)) return AI_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}
