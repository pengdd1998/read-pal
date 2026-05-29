'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { PURIFY_CONFIG } from '@/lib/dompurify-config';
import { highlightCodeBlocks, preloadPrism } from '@/lib/syntax-highlight';
import { themeClasses, progressBg, progressFill, type ReaderTheme } from '@/lib/reader-theme';
import { useScrollPersistence } from '@/hooks/useScrollPersistence';
import { useReaderKeyboardNav } from '@/hooks/useReaderKeyboardNav';
import { useReaderSwipeNav } from '@/hooks/useReaderSwipeNav';
import { ChapterDropdown } from '@/components/reading/ChapterDropdown';
import { ReaderFooter } from '@/components/reading/ReaderFooter';

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
  theme: ReaderTheme;
  fontFamily?: string;
  lineHeight?: number;
  showControls?: boolean;
  onToggleControls?: () => void;
  externalTocOpen?: boolean;
  onTocClose?: () => void;
  highlightMode?: boolean;
  highlightCount?: number;
  bookmarkCount?: number;
  onScrollProgress?: (progress: number) => void;
  onPauseAutoHide?: () => void;
  onResumeAutoHide?: () => void;
  // Pagination within chapter
  currentSegment?: number;
  totalSegments?: number;
  onSegmentChange?: (segment: number) => void;
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
  onScrollProgress,
  onPauseAutoHide,
  onResumeAutoHide,
  currentSegment = 0,
  totalSegments = 1,
  onSegmentChange,
}: ReaderViewProps) {
  const t = useTranslations('reader');
  const [scrollProgress, setScrollProgress] = useState(0);
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

  // Preload DOMPurify on mount (no state bump — re-sanitizing would destroy
  // annotation marks inserted by useAnnotationHighlights outside React).
  useEffect(() => {
    preloadDOMPurify();
    preloadPrism();
  }, []);

  // Ref to the article element for code highlighting
  const articleRef = useRef<HTMLElement | null>(null);

  // Ref to the content div — we set innerHTML imperatively so React re-renders
  // never touch the content DOM (which would destroy annotation <mark> elements
  // that useAnnotationHighlights inserts outside React's control).
  const contentDivRef = useRef<HTMLDivElement | null>(null);

  // Memoize sanitized content — recomputes only when chapterContent changes.
  const sanitizedContent = useMemo(
    () => purifySync(chapterContent, PURIFY_CONFIG),
    [chapterContent],
  );

  // Track the last sanitizedContent we wrote to the DOM, so we only update
  // when the actual content changes (not on every re-render).
  const lastWrittenHtmlRef = useRef<string>('');

  // Set innerHTML imperatively — React never reconciles this div's children.
  useEffect(() => {
    const el = contentDivRef.current;
    if (!el) return;
    if (lastWrittenHtmlRef.current === sanitizedContent) return;
    el.innerHTML = sanitizedContent;
    lastWrittenHtmlRef.current = sanitizedContent;
  }, [sanitizedContent]);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Scroll progress tracking ---
  const updateScrollProgress = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = scrollHeight - clientHeight;
    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
    setScrollProgress(progress);
    onScrollProgress?.(progress);
  }, [onScrollProgress]);

  // --- Scroll persistence ---
  const handleProgressRestore = useCallback((fraction: number, _scrollTop: number) => {
    setScrollProgress(fraction);
    onScrollProgress?.(fraction);
  }, [onScrollProgress]);

  useScrollPersistence({
    containerRef,
    bookId,
    currentPage,
    currentSegment,
    chapterContent,
    onProgressUpdate: handleProgressRestore,
  });

  // Apply Prism.js syntax highlighting to code blocks after content renders
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    highlightCodeBlocks(el).catch(() => { /* non-critical — graceful degradation */ });
  }, [sanitizedContent]);

  // --- Navigation (segment within chapter, then chapter) ---
  const goNextPage = useCallback(() => {
    if (onSegmentChange && currentSegment < totalSegments - 1) {
      onSegmentChange(currentSegment + 1);
    } else if (currentPage < totalPages - 1) {
      onPageChange(currentPage + 1);
    }
  }, [currentSegment, totalSegments, currentPage, totalPages, onPageChange, onSegmentChange]);

  const goPrevPage = useCallback(() => {
    if (onSegmentChange && currentSegment > 0) {
      onSegmentChange(currentSegment - 1);
    } else if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  }, [currentSegment, currentPage, totalPages, onPageChange, onSegmentChange]);

  // --- Keyboard & swipe navigation ---
  useReaderKeyboardNav({ goNextPage, goPrevPage, currentPage, totalPages, onPageChange });
  useReaderSwipeNav({ containerRef, currentPage, totalPages, onPageChange, goNextPage, goPrevPage });

  // Chapter fade animation on content change
  useEffect(() => {
    if (articleRef.current) {
      articleRef.current.classList.remove('animate-chapter-fade');
      void articleRef.current.offsetWidth;
      articleRef.current.classList.add('animate-chapter-fade');
    }
  }, [chapterContent]);

  // Overall book progress
  const overallProgress = totalPages > 1
    ? Math.round(((currentPage + scrollProgress) / totalPages) * 100)
    : Math.round(scrollProgress * 100);

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${themeClasses[theme]} transition-colors duration-200`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, [data-selection-toolbar], footer')) return;
        if (selectingRef.current) return;
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
        className="flex-1 overflow-y-auto min-h-0 reading-scroll-container"
        style={{ overscrollBehavior: 'contain' } as React.CSSProperties}
        onScroll={updateScrollProgress}
      >
        <article
          ref={articleRef}
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
            ref={(el) => {
              contentDivRef.current = el;
              if (contentRef) {
                (contentRef as React.MutableRefObject<HTMLElement | null>).current = el;
              }
            }}
            className="prose prose-lg max-w-none dark:prose-invert reader-content"
            suppressHydrationWarning
          />

          {/* End-of-chapter marker */}
          <div className="chapter-end">
            <div className="chapter-end-line" />
          </div>
        </article>
      </div>

      {/* Bottom navigation bar */}
      <ReaderFooter
        currentPage={currentPage}
        totalPages={totalPages}
        currentSegment={currentSegment}
        totalSegments={totalSegments}
        chapters={chapters}
        theme={theme}
        overallProgress={overallProgress}
        showControls={showControls}
        onPauseAutoHide={onPauseAutoHide}
        onResumeAutoHide={onResumeAutoHide}
        onPrevPage={goPrevPage}
        onNextPage={goNextPage}
        chapterDropdown={
          <ChapterDropdown
            currentPage={currentPage}
            totalPages={totalPages}
            currentSegment={currentSegment}
            totalSegments={totalSegments}
            chapters={chapters}
            theme={theme}
            onPageChange={onPageChange}
            externalTocOpen={externalTocOpen}
            onTocClose={onTocClose}
          />
        }
      />
    </div>
  );
});

export type { ReaderViewProps };
