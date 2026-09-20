import { describe, expect, it } from 'vitest';

import { AI_TIMEOUT_MS, BOOK_CONTENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, getTimeoutForUrl } from '../timeouts';

describe('getTimeoutForUrl', () => {
  it('gives AI timeout to LLM-backed endpoints, incl. research', () => {
    // research took ~95s server-side; the 15s default aborted it mid-flight
    // (ERR_ABORTED) and the panel showed a spurious error (J1 verification).
    expect(getTimeoutForUrl('/api/v1/agents/research')).toBe(AI_TIMEOUT_MS);
    expect(getTimeoutForUrl('/api/v1/agent/reading-plan')).toBe(AI_TIMEOUT_MS);
    expect(getTimeoutForUrl('/api/v1/reading-book/generate')).toBe(AI_TIMEOUT_MS);
    expect(getTimeoutForUrl('/api/v1/synthesis')).toBe(AI_TIMEOUT_MS);
  });

  it('gives book-content timeout to full-book fetches', () => {
    expect(getTimeoutForUrl('/api/v1/upload/books/abc-123/content')).toBe(BOOK_CONTENT_TIMEOUT_MS);
  });

  it('falls back to the default for ordinary CRUD', () => {
    expect(getTimeoutForUrl('/api/v1/stats/dashboard')).toBe(DEFAULT_TIMEOUT_MS);
  });
});
