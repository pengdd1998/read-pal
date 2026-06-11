'use client';

import { useState, useEffect, useRef } from 'react';
import { getAuthToken } from '@/lib/auth-fetch';
import { API_BASE_URL, api } from '@/lib/api';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/safe-storage';

interface UseReaderProgressOptions {
  bookId: string;
  loading: boolean;
  currentChapter: number;
  chapterScrollProgress: number;
  currentSegment: number;
}

/**
 * Tracks reading progress and saves it on page unload using keepalive.
 * Also fetches the user's current reading speed (WPM).
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
      } catch (e) { console.warn('useReaderProgress: localStorage save failed:', e); }
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
          console.warn('Reader: keepalive progress save failed', err);
        });
      } catch (err) {
        console.warn('Reader: keepalive progress save failed', err);
      }
    };
  }, [bookId, loading]);

  // Reading speed (fetch once)
  const [readingWpm, setReadingWpm] = useState<number | null>(null);
  const wpmFetchedRef = useRef(false);
  useEffect(() => {
    if (loading || wpmFetchedRef.current) return;
    let cancelled = false;
    api.get<{ currentWpm: number; trend: string }>('/api/stats/reading-speed')
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data && res.data.currentWpm > 0) {
          wpmFetchedRef.current = true;
          setReadingWpm(res.data.currentWpm);
        }
      })
      .catch((err) => { if (!cancelled) console.warn('Reader: reading speed fetch failed', err); });
    return () => { cancelled = true; wpmFetchedRef.current = false; };
  }, [loading]);

  return { readingWpm };
}
