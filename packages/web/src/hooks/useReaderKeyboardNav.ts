'use client';

import { useEffect } from 'react';

interface UseReaderKeyboardNavOptions {
  goNextPage: () => void;
  goPrevPage: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Arrow-key navigation for the reader.
 * Shift+Arrow jumps to the previous/next chapter directly.
 */
export function useReaderKeyboardNav({
  goNextPage,
  goPrevPage,
  currentPage,
  totalPages,
  onPageChange,
}: UseReaderKeyboardNavOptions) {
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        if (e.shiftKey) {
          if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
        } else {
          goNextPage();
        }
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) {
          if (currentPage > 0) onPageChange(currentPage - 1);
        } else {
          goPrevPage();
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [goNextPage, goPrevPage, currentPage, totalPages, onPageChange]);
}
