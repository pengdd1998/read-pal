'use client';

import React, { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import DOMPurify from 'dompurify';

interface ReaderViewProps {
  bookId: string;
  chapterContent: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  contentRef?: RefObject<HTMLElement | null>;
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  onThemeChange?: (theme: 'light' | 'dark' | 'sepia') => void;
  onFontSizeChange?: (fontSize: number) => void;
  showControls?: boolean;
  onToggleControls?: () => void;
}

export function ReaderView({
  bookId,
  chapterContent,
  chapterTitle,
  currentPage,
  totalPages,
  onPageChange,
  contentRef,
  fontSize,
  theme,
  showControls = true,
  onToggleControls,
}: ReaderViewProps) {
  const [scrollProgress, setScrollProgress] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // --- Scroll progress tracking ---
  const updateScrollProgress = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    setScrollProgress(maxScroll > 0 ? scrollTop / maxScroll : 0);
  }, []);

  // Reset scroll position on chapter change + animate
  const [chapterKey, setChapterKey] = useState(0);
  useEffect(() => {
    setChapterKey((k) => k + 1);
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        setScrollProgress(0);
      }
    });
  }, [chapterContent]);

  // --- Navigation (direct chapter navigation) ---
  const goNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, onPageChange]);

  const goPrevPage = useCallback(() => {
    if (currentPage > 0) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);

  // --- Keyboard navigation ---
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        goNextPage();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goPrevPage();
      } else if (e.key === 'ArrowRight') {
        if (e.shiftKey) {
          if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (e.shiftKey) {
          if (currentPage > 0) onPageChange(currentPage - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [goNextPage, goPrevPage, currentPage, totalPages, onPageChange]);

  // --- Touch swipe for chapter navigation ---
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

      if (deltaX < 0 && currentPage < totalPages - 1) {
        onPageChange(currentPage + 1);
      } else if (deltaX > 0 && currentPage > 0) {
        onPageChange(currentPage - 1);
      }
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
    };
  }, [currentPage, totalPages, onPageChange]);

  // --- Theme classes ---
  const themeClasses = {
    light: 'bg-white text-gray-800',
    dark: 'bg-gray-900 text-gray-200',
    sepia: 'bg-[#faf6f0] text-[#5c4b37]',
  };

  const progressBg = {
    light: 'bg-gray-200',
    dark: 'bg-gray-700',
    sepia: 'bg-amber-200/60',
  };

  const progressFill = {
    light: 'bg-gradient-to-r from-teal-500 to-amber-500',
    dark: 'bg-gradient-to-r from-teal-400 to-amber-400',
    sepia: 'bg-gradient-to-r from-amber-600 to-amber-400',
  };

  // Overall book progress
  const overallProgress = totalPages > 1
    ? Math.round(((currentPage + scrollProgress) / totalPages) * 100)
    : Math.round(scrollProgress * 100);

  const clampedProgress = Math.min(100, Math.max(0, overallProgress));

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${themeClasses[theme]} transition-colors duration-200`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, [data-selection-toolbar], footer')) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        onToggleControls?.();
      }}
    >
      {/* Scrollable reading area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onScroll={updateScrollProgress}
      >
        <article
          key={chapterKey}
          ref={(el) => {
            if (contentRef) {
              (contentRef as React.MutableRefObject<HTMLElement | null>).current = el;
            }
          }}
          className="reading-mode select-text animate-chapter-fade"
          style={{
            fontSize: `${fontSize}px`,
          }}
        >
          {/* Chapter header */}
          {chapterTitle && (
            <div className="chapter-header">
              <span className="chapter-number">Chapter {currentPage + 1}</span>
              <h2 className="chapter-title">{chapterTitle}</h2>
              <div className="chapter-divider">
                <span className="chapter-ornament">&#10047;</span>
              </div>
            </div>
          )}

          <div
            className="prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(chapterContent) }}
          />

          {/* End-of-chapter marker */}
          <div className="chapter-end">
            <div className="chapter-end-line" />
          </div>
        </article>
      </div>

      {/* Bottom navigation bar — toggles with controls */}
      <footer
        className={`shrink-0 border-t transition-all duration-300 ease-out ${
          theme === 'dark' ? 'border-gray-700/50 bg-gray-900/95' : theme === 'sepia' ? 'border-amber-200/60 bg-[#faf6f0]/95' : 'border-gray-200/60 bg-white/95'
        } backdrop-blur-sm ${
          showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar — overall book progress */}
        <div className={`h-1 ${progressBg[theme]}`}>
          <div
            className={`h-1 ${progressFill[theme]} transition-all duration-300 ease-out`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        {/* Chapter navigation */}
        <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
          <button
            onClick={goPrevPage}
            disabled={currentPage === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-95 min-w-[80px]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="flex-1 mx-4 text-center min-w-0">
            <div className="text-xs font-medium opacity-60 truncate">
              Chapter {currentPage + 1} of {totalPages}
            </div>
            <div className="text-[10px] opacity-40 mt-0.5">
              {clampedProgress}% complete
            </div>
          </div>

          <button
            onClick={goNextPage}
            disabled={currentPage >= totalPages - 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-95 min-w-[80px] justify-end"
          >
            <span className="hidden sm:inline">Next</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </footer>
    </div>
  );
}

export type { ReaderViewProps };
