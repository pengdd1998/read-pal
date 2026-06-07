'use client';

import { useEffect, useCallback } from 'react';

interface UseScrollPersistenceOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  bookId: string;
  currentPage: number;
  currentSegment: number;
  chapterContent: string;
  onProgressUpdate: (fraction: number, scrollTop: number) => void;
}

/**
 * Persists scroll position across chapter changes and browser sessions.
 *
 * - Saves to localStorage on unmount / visibility-hidden / every 10s.
 * - Restores saved position when a new chapter/segment loads.
 * - Triggers chapter fade animation via the returned article ref callback.
 */
export function useScrollPersistence({
  containerRef,
  bookId,
  currentPage,
  currentSegment,
  chapterContent,
  onProgressUpdate,
}: UseScrollPersistenceOptions) {
  const scrollKey = `scroll-${bookId}-ch${currentPage}-seg${currentSegment}`;

  // --- Save scroll position ---
  const saveScrollPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll > 0) {
      const fraction = Math.min(1, Math.max(0, scrollTop / maxScroll));
      try { localStorage.setItem(scrollKey, String(fraction)); } catch (err) { console.warn('Storage error: failed to save scroll position', err); }
    }
  }, [containerRef, scrollKey]);

  // Save on unmount, visibility change, and periodically
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveScrollPosition();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const periodicSave = setInterval(saveScrollPosition, 10_000);
    return () => {
      saveScrollPosition();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(periodicSave);
    };
  }, [saveScrollPosition]);

  // Restore scroll on chapter/segment change
  useEffect(() => {
    let outerRaf: number | undefined;
    let innerRaf: number | undefined;
    outerRaf = requestAnimationFrame(() => {
      if (containerRef.current) {
        try {
          const saved = localStorage.getItem(scrollKey);
          if (saved) {
            const fraction = parseFloat(saved);
            if (fraction > 0 && containerRef.current) {
              innerRaf = requestAnimationFrame(() => {
                if (containerRef.current) {
                  const { scrollHeight, clientHeight } = containerRef.current;
                  containerRef.current.scrollTop = fraction * (scrollHeight - clientHeight);
                  onProgressUpdate(fraction, containerRef.current.scrollTop);
                }
              });
              return;
            }
          }
        } catch (err) { console.warn('Storage error: failed to restore scroll position', err); }
        containerRef.current.scrollTop = 0;
        onProgressUpdate(0, 0);
      }
    });
    return () => {
      if (outerRaf) cancelAnimationFrame(outerRaf);
      if (innerRaf) cancelAnimationFrame(innerRaf);
    };
  }, [chapterContent, scrollKey, saveScrollPosition, containerRef, onProgressUpdate]);

  return { saveScrollPosition };
}
