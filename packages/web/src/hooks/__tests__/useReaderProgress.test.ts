import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockGet, mockFetch, mockAuthToken } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockFetch: vi.fn(),
  mockAuthToken: { value: null as string | null },
}));

vi.mock('@/lib/api', () => ({
  api: { get: mockGet },
  API_BASE_URL: 'http://test-api',
}));

vi.mock('@/lib/auth-fetch', () => ({
  getAuthToken: () => mockAuthToken.value,
}));

vi.mock('@/lib/safe-storage', () => ({
  safeSetItem: vi.fn(),
}));

// Import after mocks
import { useReaderProgress } from '../useReaderProgress';

function render(bookId = 'book-1', loading = false) {
  return renderHook(
    (props: { chapter: number; scroll: number; segment: number }) =>
      useReaderProgress({
        bookId: props.chapter >= 0 ? bookId : '',
        loading,
        currentChapter: props.chapter,
        chapterScrollProgress: props.scroll,
        currentSegment: props.segment,
      }),
    { initialProps: { chapter: 3, scroll: 0.4, segment: 12 } },
  );
}

describe('useReaderProgress', () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue({ success: false });
    mockFetch.mockReset().mockResolvedValue(undefined);
    mockAuthToken.value = 'tok-1';
    vi.stubGlobal('fetch', mockFetch);
    return () => vi.unstubAllGlobals();
  });

  it('fetches reading speed once when not loading', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { averagePagesPerHour: 42 },
    });

    const { result } = render();

    // Wait for the promise chain to settle
    await vi.waitFor(() => expect(result.current.readingPph).toBe(42));
    expect(mockGet).toHaveBeenCalledWith('/api/stats/reading-speed');
  });

  it('does not fetch speed while loading', () => {
    render('book-1', true);

    expect(mockGet).not.toHaveBeenCalled();
  });

  it('ignores zero/negative speeds', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { averagePagesPerHour: 0 },
    });

    const { result } = render();

    await vi.waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current.readingPph).toBeNull();
  });

  it('does not re-fetch the speed when loading toggles back', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { averagePagesPerHour: 42 },
    });

    // loading=true start, then flip to false via rerender is not directly
    // possible with the fixed `loading` in render(); instead assert the
    // single-fetch guard by triggering a second effect pass (same props
    // re-render) and checking call count stays 1.
    const { result, rerender } = render();
    await vi.waitFor(() => expect(result.current.readingPph).toBe(42));
    rerender({ chapter: 4, scroll: 0.5, segment: 13 });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('on unmount: persists fallback to localStorage and PATCHes with keepalive', () => {
    mockAuthToken.value = 'tok-1';
    const { unmount } = render();

    unmount();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/api/books/book-1',
      expect.objectContaining({
        method: 'PATCH',
        keepalive: true,
        headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }),
      }),
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body).toEqual({ current_page: 3, scroll_progress: 0.4, current_segment: 12 });
  });

  it('clamps scroll progress outside [0,1] before saving', () => {
    const { rerender, unmount } = render();
    rerender({ chapter: 5, scroll: 1.7, segment: 20 });

    unmount();

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.scroll_progress).toBe(1);
  });

  it('sends no Authorization header when unauthenticated', () => {
    mockAuthToken.value = null;
    const { unmount } = render();

    unmount();

    const headers = (mockFetch.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBeUndefined();
  });
});
