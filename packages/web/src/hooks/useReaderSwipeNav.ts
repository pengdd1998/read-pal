'use client';

import { useEffect, useRef } from 'react';

interface UseReaderSwipeNavOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  goNextPage: () => void;
  goPrevPage: () => void;
}

/**
 * Touch swipe navigation for the reader.
 * Left-swipe → next page, right-swipe → previous page.
 * Requires at least 100px horizontal delta and a dominant horizontal motion.
 */
export function useReaderSwipeNav({
  containerRef,
  goNextPage,
  goPrevPage,
}: UseReaderSwipeNavOptions) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      // Only handle distinct horizontal swipes
      if (Math.abs(deltaX) < 100 || Math.abs(deltaY) > Math.abs(deltaX) * 0.7) return;

      if (deltaX < 0) {
        goNextPage();
      } else if (deltaX > 0) {
        goPrevPage();
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef, goNextPage, goPrevPage]);
}
