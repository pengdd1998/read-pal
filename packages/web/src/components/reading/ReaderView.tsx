'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle } from '@/components/icons';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { highlightCodeBlocks, preloadPrism } from '@/lib/syntax-highlight';

// DOMPurify configuration that preserves technical formatting tags
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'img', 'figure', 'figcaption', 'picture', 'source',
    'a', 'span', 'div', 'section', 'article', 'aside', 'details', 'summary',
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'text', 'tspan',
    'del', 'ins', 'abbr', 'cite', 'dfn', 'kbd', 'samp', 'var', 'time',
    'sup', 'sub', 'ruby', 'rt', 'rp',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'class', 'id', 'style',
    'colspan', 'rowspan', 'headers', 'scope',
    'width', 'height', 'loading',
    'datetime', 'cite',
    // SVG attributes
    'd', 'cx', 'cy', 'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
    'points', 'viewBox', 'fill', 'stroke', 'stroke-width',
    'transform', 'xmlns', 'version', 'preserveAspectRatio',
    'font-family', 'font-size', 'text-anchor',
  ],
  ALLOW_DATA_ATTR: false,
};

interface ChapterItem {
  title: string;
}

interface ReaderViewProps {
  bookId: string;
  chapterContent: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  chapters: ChapterItem[];
  onPageChange: (page: number) => void;
  contentRef?: RefObject<HTMLElement | null>;
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  fontFamily?: string;
  lineHeight?: number;
  showControls?: boolean;
  onToggleControls?: () => void;
  externalTocOpen?: boolean;
  onTocClose?: () => void;
  highlightMode?: boolean;
  highlightCount?: number;
  bookmarkCount?: number;
}

export function ReaderView({
  bookId,
  chapterContent,
  chapterTitle,
  currentPage,
  totalPages,
  chapters,
  onPageChange,
  contentRef,
  fontSize,
  theme,
  fontFamily,
  lineHeight,
  showControls = true,
  onToggleControls,
  externalTocOpen,
  onTocClose,
  highlightMode: _highlightMode,
  highlightCount = 0,
  bookmarkCount = 0,
}: ReaderViewProps) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const chapterMenuRef = useRef<HTMLDivElement>(null);

  // Preload DOMPurify on mount so purifySync works immediately after
  useEffect(() => { preloadDOMPurify(); preloadPrism(); }, []);

  // Ref to the article element for code highlighting
  const articleRef = useRef<HTMLElement | null>(null);

  // Memoize sanitized content to avoid re-sanitizing on every render
  // Uses purifySync which falls back to script-stripping if DOMPurify hasn't loaded yet
  const sanitizedContent = useMemo(
    () => purifySync(chapterContent, PURIFY_CONFIG),
    [chapterContent],
  );

  // Sync with external TOC control
  useEffect(() => {
    if (externalTocOpen !== undefined && externalTocOpen !== showChapterMenu) {
      setShowChapterMenu(externalTocOpen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTocOpen]);

  // Notify parent when TOC closes internally
  const closeChapterMenu = useCallback(() => {
    setShowChapterMenu(false);
    onTocClose?.();
  }, [onTocClose]);

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
  // Also persists scroll position so returning readers don't lose their place
  const [chapterKey, setChapterKey] = useState(0);

  // Apply Prism.js syntax highlighting to code blocks after content renders
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    highlightCodeBlocks(el).catch(() => { /* non-critical — graceful degradation */ });
  }, [sanitizedContent, chapterKey]);

  // Save scroll position before chapter changes or component unmounts
  const scrollKey = `scroll-${bookId}-ch${currentPage}`;
  const saveScrollPosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll > 0) {
      try { localStorage.setItem(scrollKey, String(scrollTop / maxScroll)); } catch { /* ignore */ }
    }
  }, [scrollKey]);

  // Save on unmount and visibility change, and periodically during reading
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveScrollPosition();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Periodic save every 10s while reading
    const periodicSave = setInterval(saveScrollPosition, 10_000);
    return () => {
      saveScrollPosition();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(periodicSave);
    };
  }, [saveScrollPosition]);

  useEffect(() => {
    // Save previous chapter's scroll position before switching
    saveScrollPosition();
    setChapterKey((k) => k + 1);
    let outerRaf: number | undefined;
    let innerRaf: number | undefined;
    outerRaf = requestAnimationFrame(() => {
      if (containerRef.current) {
        // Try to restore saved scroll position for this chapter
        try {
          const saved = localStorage.getItem(`scroll-${bookId}-ch${currentPage}`);
          if (saved) {
            const fraction = parseFloat(saved);
            if (fraction > 0 && containerRef.current) {
              // Wait for content to render before restoring scroll
              innerRaf = requestAnimationFrame(() => {
                if (containerRef.current) {
                  const { scrollHeight, clientHeight } = containerRef.current;
                  containerRef.current.scrollTop = fraction * (scrollHeight - clientHeight);
                  setScrollProgress(fraction);
                }
              });
              return;
            }
          }
        } catch { /* ignore */ }
        containerRef.current.scrollTop = 0;
        setScrollProgress(0);
      }
    });
    return () => {
      if (outerRaf) cancelAnimationFrame(outerRaf);
      if (innerRaf) cancelAnimationFrame(innerRaf);
    };
  }, [chapterContent, bookId, currentPage, saveScrollPosition]);

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

  // --- Close chapter menu on outside click ---
  useEffect(() => {
    if (!showChapterMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (chapterMenuRef.current && !chapterMenuRef.current.contains(e.target as Node)) {
        closeChapterMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChapterMenu, closeChapterMenu]);

  // Close chapter menu when controls are hidden
  useEffect(() => {
    if (!showControls) closeChapterMenu();
  }, [showControls, closeChapterMenu]);

  // Overall book progress
  const overallProgress = totalPages > 1
    ? Math.round(((currentPage + scrollProgress) / totalPages) * 100)
    : Math.round(scrollProgress * 100);

  const clampedProgress = Math.min(100, Math.max(0, overallProgress));

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${themeClasses[theme]} transition-colors duration-200`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, [data-selection-toolbar], footer')) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        onToggleControls?.();
      }}
    >
      {/* Thin chapter progress bar at top */}
      <div className={`h-0.5 shrink-0 ${progressBg[theme]}`}>
        <div
          className={`h-0.5 ${progressFill[theme]} transition-all duration-300 ease-out`}
          style={{ width: `${Math.round(scrollProgress * 100)}%` }}
        />
      </div>

      {/* Scrollable reading area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ overscrollBehavior: 'contain' } as React.CSSProperties}
        onScroll={updateScrollProgress}
      >
        <article
          key={chapterKey}
          ref={(el) => {
            articleRef.current = el;
            if (contentRef) {
              (contentRef as React.MutableRefObject<HTMLElement | null>).current = el;
            }
          }}
          className="reading-mode select-text animate-chapter-fade"
          data-theme={theme}
          style={{
            fontSize: `${fontSize}px`,
            ...(fontFamily ? { fontFamily } : {}),
            ...(lineHeight ? { lineHeight } : {}),
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
            className="prose prose-lg max-w-none dark:prose-invert reader-content"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />

          {/* End-of-chapter marker */}
          <div className="chapter-end">
            <div className="chapter-end-line" />
          </div>
        </article>
      </div>

      {/* Bottom navigation bar — toggles with controls */}
      <footer
        className={`border-t transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          theme === 'dark' ? 'border-gray-700/50 bg-gray-900/95' : theme === 'sepia' ? 'border-amber-200/60 bg-[#faf6f0]/95' : 'border-gray-200/60 bg-white/95'
        } backdrop-blur-sm ${
          showControls
            ? 'translate-y-0 opacity-100 shrink-0'
            : 'translate-y-full opacity-0 pointer-events-none absolute bottom-0 left-0 right-0'
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
            className="flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-95 min-w-[60px] sm:min-w-[80px]"
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Chapter dropdown / TOC */}
          <div className="flex-1 mx-2 sm:mx-4 min-w-0 relative" ref={chapterMenuRef}>
            <button
              onClick={() => setShowChapterMenu((v) => !v)}
              className={`w-full flex flex-col items-center px-2 py-2 sm:py-1 rounded-lg transition-colors ${
                showChapterMenu
                  ? 'bg-amber-100/80 dark:bg-amber-900/40'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              aria-label="Open chapter list"
              aria-expanded={showChapterMenu}
            >
              <span className="text-xs font-medium opacity-70 truncate w-full text-center">
                Chapter {currentPage + 1} of {totalPages}
              </span>
              <span className="text-[10px] opacity-40 mt-0.5 truncate w-full text-center">
                {chapters[currentPage]?.title || ''} &middot; {clampedProgress}%
              </span>
              {/* Highlight & bookmark badges */}
              {(highlightCount > 0 || bookmarkCount > 0) && (
                <div className="flex items-center gap-1.5 mt-1 justify-center">
                  {highlightCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500/70">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z" />
                      </svg>
                      {highlightCount}
                    </span>
                  )}
                  {bookmarkCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-500/70">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                      </svg>
                      {bookmarkCount}
                    </span>
                  )}
                </div>
              )}
              <ChevronDown
                className={`w-3 h-3 opacity-40 mt-0.5 transition-transform ${showChapterMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown / bottom sheet */}
            {showChapterMenu && (
              <>
                {/* Mobile backdrop */}
                <div
                  className="fixed inset-0 z-30 md:hidden bg-black/20 backdrop-blur-sm"
                  onClick={closeChapterMenu}
                />

                {/* Dropdown panel — opens upward since footer is at bottom */}
                <div
                  className={`absolute left-0 right-0 bottom-full z-40 mb-1 rounded-xl shadow-lg border max-h-[60vh] md:max-h-[40vh] overflow-y-auto ${
                    theme === 'dark'
                      ? 'bg-gray-800 border-gray-700'
                      : theme === 'sepia'
                        ? 'bg-[#f5f0e6] border-amber-300/60'
                        : 'bg-white border-amber-200/60'
                  }`}
                  style={{ overscrollBehavior: 'contain' } as React.CSSProperties}
                >
                  {/* Header */}
                  <div className={`sticky top-0 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b ${
                    theme === 'dark'
                      ? 'bg-gray-800 text-gray-400 border-gray-700'
                      : theme === 'sepia'
                        ? 'bg-[#f5f0e6] text-amber-700 border-amber-300/60'
                        : 'bg-white text-amber-600 border-amber-200/60'
                  }`}>
                    Table of Contents
                  </div>

                  {chapters.map((ch, i) => {
                    const isCurrent = i === currentPage;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          onPageChange(i);
                          closeChapterMenu();
                        }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                          isCurrent
                            ? theme === 'dark'
                              ? 'bg-amber-900/30 text-amber-300'
                              : theme === 'sepia'
                                ? 'bg-amber-200/50 text-amber-900'
                                : 'bg-amber-100/60 text-amber-800'
                            : theme === 'dark'
                              ? 'text-gray-300 hover:bg-gray-700/60'
                              : theme === 'sepia'
                                ? 'text-amber-900/80 hover:bg-amber-100/40'
                                : 'text-gray-700 hover:bg-amber-50'
                        }`}
                      >
                        <span className={`flex-shrink-0 w-6 text-xs font-mono text-right ${
                          isCurrent ? 'font-bold' : 'opacity-40'
                        }`}>
                          {i + 1}
                        </span>
                        <span className={`truncate ${isCurrent ? 'font-semibold' : ''}`}>
                          {ch.title || `Chapter ${i + 1}`}
                        </span>
                        {isCurrent && (
                          <span className="flex-shrink-0 ml-auto">
                            <CheckCircle className="w-4 h-4 text-amber-500" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <button
            onClick={goNextPage}
            disabled={currentPage >= totalPages - 1}
            className="flex items-center gap-1.5 px-4 py-3 sm:py-2 rounded-xl text-sm font-medium disabled:opacity-25 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-95 min-w-[60px] sm:min-w-[80px] justify-end"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </button>
        </div>
      </footer>
    </div>
  );
}

export type { ReaderViewProps };
