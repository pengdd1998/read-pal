import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { countWords, useChapterTimeLeft } from '../useChapterTimeLeft';

describe('countWords', () => {
  it('counts latin words', () => {
    expect(countWords('the quick brown fox')).toBe(4);
  });

  it('counts CJK characters as words', () => {
    expect(countWords('路边野餐是科幻小说')).toBe(9);
  });

  it('mixes CJK and latin', () => {
    // 2 CJK chars + 2 latin words = 4 words
    expect(countWords('读书 reading time')).toBe(2 + 2);
  });

  it('strips HTML tags before counting', () => {
    expect(countWords('<p>hello <b>world</b></p>')).toBe(2);
  });

  it('empty input → 0', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('<p></p>')).toBe(0);
  });
});

describe('useChapterTimeLeft', () => {
  const chapter = '<p>' + 'word '.repeat(2600) + '</p>'; // 2600 words ≈ 10 min at 260wpm

  it('full chapter unread → total minutes', () => {
    const { result } = renderHook(() => useChapterTimeLeft(chapter, 0));
    expect(result.current).toBe(10);
  });

  it('halfway → about half the minutes', () => {
    const { result } = renderHook(() => useChapterTimeLeft(chapter, 0.5));
    expect(result.current).toBe(5);
  });

  it('never returns 0 near the end (min 1)', () => {
    const { result } = renderHook(() => useChapterTimeLeft(chapter, 0.999));
    expect(result.current).toBeGreaterThanOrEqual(1);
  });

  it('empty chapter → 0 (renders nothing)', () => {
    const { result } = renderHook(() => useChapterTimeLeft('', 0.5));
    expect(result.current).toBe(0);
  });

  it('honours a custom reading rate', () => {
    const { result, rerender } = renderHook(
      ({ progress }) => useChapterTimeLeft(chapter, progress, 520),
      { initialProps: { progress: 0 } },
    );
    expect(result.current).toBe(5); // 2600 words at 520wpm
    act(() => rerender({ progress: 0.5 }));
    expect(result.current).toBeGreaterThanOrEqual(1);
  });
});
