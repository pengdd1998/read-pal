import { describe, expect, it } from 'vitest';
import { getTimeoutForUrl, BOOK_CONTENT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from '../api/timeouts';

describe('getTimeoutForUrl — 大书内容端点 60s 档（UI-R-01 发现）', () => {
  it('全本书籍内容 GET 使用 BOOK_CONTENT_TIMEOUT', () => {
    expect(getTimeoutForUrl('/api/upload/books/abc-123/content?_t=1')).toBe(BOOK_CONTENT_TIMEOUT_MS);
    expect(getTimeoutForUrl('/api/upload/books/3a049b72-9b74-46d5-b202-34dad2861c8b/content')).toBe(BOOK_CONTENT_TIMEOUT_MS);
  });

  it('普通 CRUD 保持 15s 默认', () => {
    expect(getTimeoutForUrl('/api/books')).toBe(DEFAULT_TIMEOUT_MS);
    expect(getTimeoutForUrl('/api/annotations?book_id=x')).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('AI 端点保持 180s 档', () => {
    expect(getTimeoutForUrl('/api/synthesis/cross-book')).toBe(180_000);
    expect(getTimeoutForUrl('/api/reading-book/generate')).toBe(180_000);
  });
});
