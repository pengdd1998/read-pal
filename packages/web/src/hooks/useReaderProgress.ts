'use client';

import { useState, useEffect, useRef } from 'react';
import { getAuthToken } from '@/lib/auth-fetch';
import { API_BASE_URL, api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { safeSetItem } from '@/lib/safe-storage';

interface UseReaderProgressOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chapterScrollProgress: number;
  currentSegment: number;
}

/**
 * Tracks reading progress and saves it on page unload using keepalive.
 * Also fetches the user's current reading speed (pages/hour).
 */
export function useReaderProgress({
  bookId,
  loading,
  currentChapter,
  chapterScrollProgress,
  currentSegment,
}: UseReaderProgressOptions) {
  // Keep refs in sync for the unload handler (single effect)
  const currentChapterRef = useRef(currentChapter);
  const scrollProgressRef = useRef(chapterScrollProgress);
  const currentSegmentRef = useRef(currentSegment);
  currentChapterRef.current = currentChapter;
  scrollProgressRef.current = chapterScrollProgress;
  currentSegmentRef.current = currentSegment;

  // Save progress on leave
  useEffect(() => {
    if (loading || !bookId) return;
    return () => {
      const token = getAuthToken();
      const chapter = currentChapterRef.current;
      const scroll = Math.min(1, Math.max(0, scrollProgressRef.current));
      const segment = currentSegmentRef.current;
      // Persist to localStorage as fallback in case keepalive fetch is dropped
      try {
        safeSetItem(`readpal-progress-${bookId}`, JSON.stringify({
          current_page: chapter,
          scroll_progress: scroll,
          current_segment: segment,
          saved_at: Date.now(),
        }));
      } catch (e) { warn('useReaderProgress: localStorage save failed:', e); }
      try {
        fetch(`${API_BASE_URL}/api/books/${bookId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ current_page: chapter, scroll_progress: scroll, current_segment: segment }),
          keepalive: true,
        }).catch((err) => {
          warn('Reader: keepalive progress save failed', err);
        });
      } catch (err) {
        warn('Reader: keepalive progress save failed', err);
      }
    };
  }, [bookId, loading]);

  // Reading speed (fetch once per book). Uses pages/hour rather than the
  // derived wpm: the backend's wpm = pph * 250 / 60 assumes 250 words/page,
  // which is wildly off for most books. The guard lives outside the effect
  // so it isn't reset when `loading` toggles — without that, a chapter-change
  // loading blip would clear pphFetchedRef and re-fetch.
  const [readingPph, setReadingPph] = useState<number | null>(null);
  const pphFetchedRef = useRef(false);
  useEffect(() => {
    if (loading || pphFetchedRef.current) return;
    pphFetchedRef.current = true;
    let cancelled = false;
    api.get<{ averagePagesPerHour: number }>('/api/stats/reading-speed')
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data && res.data.averagePagesPerHour > 0) {
          setReadingPph(res.data.averagePagesPerHour);
        }
      })
      .catch((err) => { if (!cancelled) warn('Reader: reading speed fetch failed', err); });
    return () => { cancelled = true; };
  }, [loading]);

  return { readingPph };
}
