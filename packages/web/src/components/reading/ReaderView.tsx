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
}: ReaderViewProps) {
  const [showControls, setShowControls] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // --- Scroll progress tracking ---
  const updateScrollProgress = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    setScrollProgress(maxScroll > 0 ? scrollTop / maxScroll : 0);
  }, []);

  // Reset scroll position on chapter change
  useEffect(() => {
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 0;
        setScrollProgress(0);
      }
    });
  }, [chapterContent]);

  // --- Navigation ---
  const goNextPage = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop >= scrollHeight - clientHeight - 20) {
      if (currentPage < totalPages - 1) onPageChange(currentPage + 1);
    } else {
      el.scrollBy({ top: clientHeight * 0.85, behavior: 'smooth' });
    }
  }, [currentPage, totalPages, onPageChange]);

  const goPrevPage = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop <= 20) {
      if (currentPage > 0) onPageChange(currentPage - 1);
    } else {
      el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'smooth' });
    }
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

  // --- Controls toggle (don't toggle on text selection) ---
  const toggleControls = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) return;

    setShowControls((prev) => {
      const next = !prev;
      if (next) {
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = setTimeout(() => {
          setShowControls(false);
        }, 4000);
      }
      return next;
    });
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, []);

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
    light: 'bg-teal-600',
    dark: 'bg-teal-400',
    sepia: 'bg-amber-700',
  };

  // Overall book progress
  const overallProgress = totalPages > 1
    ? Math.round(((currentPage + scrollProgress) / totalPages) * 100)
    : Math.round(scrollProgress * 100);

  const clampedProgress = Math.min(100, Math.max(0, overallProgress));

  return (
    <div className={`flex flex-col h-full ${themeClasses[theme]} transition-colors duration-200`}>
      {/* Scrollable reading area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onScroll={updateScrollProgress}
        onClick={toggleControls}
      >
        <article
          ref={(el) => {
            if (contentRef) {
              (contentRef as React.MutableRefObject<HTMLElement | null>).current = el;
            }
          }}
          className="reading-mode select-text"
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

      {/* Bottom navigation bar - always visible */}
      <footer
        className={`flex-shrink-0 border-t transition-colors duration-200 ${
          theme === 'dark' ? 'border-gray-700/50 bg-gray-900/95' : theme === 'sepia' ? 'border-amber-200/60 bg-[#faf6f0]/95' : 'border-gray-200/60 bg-white/95'
        } backdrop-blur-sm`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Always-visible thin progress bar */}
        <div className={`h-0.5 ${progressBg[theme]}`}>
          <div
            className={`h-0.5 ${progressFill[theme]} transition-all duration-150 ease-out`}
            style={{ width: `${scrollProgress * 100}%` }}
          />
        </div>

        {/* Expandable controls */}
        <div className={`transition-all duration-300 ease-out overflow-hidden ${
          showControls ? 'max-h-28 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
            <button
              onClick={goPrevPage}
              disabled={currentPage === 0 && scrollProgress < 0.02}
              className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              &#8592; Prev
            </button>

            <div className="flex-1 mx-3 text-center min-w-0">
              <div className="text-xs opacity-50 truncate">
                Ch. {currentPage + 1} of {totalPages}
                <span className="mx-1.5">&middot;</span>
                {clampedProgress}% of book
              </div>
            </div>

            <button
              onClick={goNextPage}
              disabled={currentPage >= totalPages - 1 && scrollProgress > 0.98}
              className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Next &#8594;
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export type { ReaderViewProps };
