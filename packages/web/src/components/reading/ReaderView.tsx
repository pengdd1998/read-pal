'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
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

export const ReaderView = React.memo(function ReaderView({
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
  const t = useTranslations('reader');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const chapterMenuRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);

  // Track selection activity to prevent control toggle during text selection
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        selectingRef.current = true;
        setTimeout(() => { selectingRef.current = false; }, 600);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // Preload DOMPurify on mount so purifySync works immediately after
  useEffect(() => { preloadDOMPurify(); preloadPrism(); }, []);

  // Ref to the article element for code highlighting
  const articleRef = useRef<HTMLElement | null>(null);

  // Ref to the content div — we set innerHTML imperatively so React re-renders
  // never touch the content DOM (which would destroy browser text selections).
  const contentDivRef = useRef<HTMLDivElement | null>(null);

  // Memoize sanitized content to avoid re-sanitizing on every render
  // Uses purifySync which falls back to script-stripping if DOMPurify hasn't loaded yet
  const sanitizedContent = useMemo(
    () => purifySync(chapterContent, PURIFY_CONFIG),
    [chapterContent],
  );

  // Set innerHTML imperatively — only updates when sanitizedContent changes.
  // This prevents React's reconciliation from wiping the DOM during re-renders
  // triggered by selection state changes, which would destroy text selections.
  const prevContentRef = useRef<string>('');
  useEffect(() => {
    const el = contentDivRef.current;
    if (!el || sanitizedContent === prevContentRef.current) return;
    prevContentRef.current = sanitizedContent;
    el.innerHTML = sanitizedContent;
  }, [sanitizedContent]);

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

      if (e.key === 'ArrowRight') {
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
        if (selectingRef.current) return; // User is selecting text — don't toggle
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
              <span className="chapter-number">{t('reader_chapter', { num: currentPage + 1 })}</span>
              <h2 className="chapter-title">{chapterTitle}</h2>
              <div className="chapter-divider">
                <span className="chapter-ornament">&#10047;</span>
              </div>
            </div>
          )}

          <div
            ref={contentDivRef}
            className="prose prose-lg max-w-none dark:prose-invert reader-content"
            suppressHydrationWarning
          />

          {/* End-of-chapter marker */}
          <div className="chapter-end">
            <div className="chapter-end-line" />
          </div>
        </article>
      </div>

      {/* Bottom navigation bar — toggles with controls */}
      <footer
        className={`relative z-30 border-t transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          theme === 'dark' ? 'border-gray-700/50 bg-gray-900/95' : theme === 'sepia' ? 'border-amber-200/60 bg-[#faf6f0]/95' : 'border-gray-200/60 bg-white/95'
        } backdrop-blur-sm ${
          showControls
            ? 'opacity-100 shrink-0'
            : 'opacity-0 pointer-events-none shrink-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar — overall book progress */}
        <div className={`h-0.5 ${progressBg[theme]}`}>
          <div
            className={`h-0.5 ${progressFill[theme]} transition-all duration-300 ease-out`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        {/* Three-zone navigation: prev | toc | next */}
        <div className="flex items-center px-1 sm:px-4 py-1.5">
          {/* Prev — fixed touch target */}
          <button
            onClick={goPrevPage}
            disabled={currentPage === 0}
            className="w-12 h-10 sm:w-auto sm:px-3 sm:h-9 flex items-center justify-center gap-1 rounded-lg text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors shrink-0"
            aria-label={t('reader_prev_chapter')}
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="hidden sm:inline">{t('reader_prev')}</span>
          </button>

          {/* Center: compact TOC trigger — self-sizing, never stretches into nav buttons */}
          <div className="flex-1 flex justify-center min-w-0 relative" ref={chapterMenuRef}>
            <button
              onClick={() => setShowChapterMenu((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                showChapterMenu
                  ? theme === 'dark'
                    ? 'bg-amber-900/40 text-amber-300'
                    : theme === 'sepia'
                      ? 'bg-amber-200/60 text-amber-800'
                      : 'bg-amber-100/70 text-amber-700'
                  : theme === 'dark'
                    ? 'text-gray-400 hover:bg-white/5'
                    : theme === 'sepia'
                      ? 'text-amber-800/60 hover:bg-black/5'
                      : 'text-gray-500 hover:bg-black/5'
              }`}
              aria-label={t('reader_open_chapter_list')}
              aria-expanded={showChapterMenu}
            >
              <span>{t('chapter_abbr')} {currentPage + 1}/{totalPages}</span>
              <span className="hidden sm:inline opacity-50 truncate max-w-[140px]">
                {chapters[currentPage]?.title || ''}
              </span>
              <ChevronDown
                className={`w-3 h-3 opacity-50 transition-transform duration-200 ${showChapterMenu ? 'rotate-180' : ''}`}
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
                  className={`absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 sm:right-0 bottom-full z-40 mb-2 rounded-xl shadow-lg border max-h-[60vh] md:max-h-[40vh] overflow-y-auto w-64 sm:w-auto ${
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
                    {t('toc_title')}
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
                          {ch.title || t('reader_chapter', { num: i + 1 })}
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

          {/* Next — fixed touch target */}
          <button
            onClick={goNextPage}
            disabled={currentPage >= totalPages - 1}
            className="w-12 h-10 sm:w-auto sm:px-3 sm:h-9 flex items-center justify-center gap-1 rounded-lg text-sm font-medium disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors shrink-0"
            aria-label={t('reader_next_chapter')}
          >
            <span className="hidden sm:inline">{t('reader_next')}</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
});

export type { ReaderViewProps };
