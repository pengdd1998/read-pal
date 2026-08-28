'use client';

import { useMemo } from 'react';

/**
 * Estimate minutes left in the current chapter.
 *
 * Kindle-style reading comfort: a small, honest number ("12 min left")
 * helps readers decide whether to finish the chapter or pause — far more
 * actionable than a raw chapter index. Words-based, not page-based, so it
 * stays correct across font-size/line-height settings.
 *
 * The estimate splits at the current scroll position: minutes-left counts
 * only the unread remainder of the chapter.
 */

/** CJK chars count as one word each; latin text splits on whitespace. */
export function countWords(text: string): number {
  if (!text) return 0;
  // Strip HTML tags (chapter content is sanitized HTML)
  const plain = text.replace(/<[^>]+>/g, ' ');
  const cjk = plain.match(/[一-鿿぀-ヿ]/g)?.length ?? 0;
  const latin = plain
    .replace(/[一-鿿぀-ヿ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return cjk + latin;
}

/** Default reading speed: 240 wpm latin, 360 cpm CJK — blended midpoint. */
const DEFAULT_WPM = 260;

export function useChapterTimeLeft(
  chapterContent: string,
  scrollProgress: number,
  wpm?: number | null,
): number {
  return useMemo(() => {
    const total = countWords(chapterContent);
    if (total === 0) return 0;
    const rate = wpm && wpm > 80 ? wpm : DEFAULT_WPM;
    const remainingFraction = Math.max(0, 1 - scrollProgress);
    const minutes = (total * remainingFraction) / rate;
    // Round to whole minutes; anything under 30s reads as "1 min" so the
    // indicator never flickers between 0 and 1 near the chapter end.
    return Math.max(1, Math.round(minutes));
  }, [chapterContent, scrollProgress, wpm]);
}
