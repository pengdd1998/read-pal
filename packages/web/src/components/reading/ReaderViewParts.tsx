'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { progressBg, progressFill, type ReaderTheme } from '@/lib/reader-theme';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { PURIFY_CONFIG } from '@/lib/dompurify-config';
import { highlightCodeBlocks, preloadPrism } from '@/lib/syntax-highlight';
import { useScrollPersistence } from '@/hooks/useScrollPersistence';
import { useReaderKeyboardNav } from '@/hooks/useReaderKeyboardNav';
import { useReaderSwipeNav } from '@/hooks/useReaderSwipeNav';
import { warn } from '@/lib/logger';

// ---------------------------------------------------------------------------
// ChapterProgressBar — thin progress bar at the top of the reader
// ---------------------------------------------------------------------------
interface ChapterProgressBarProps {
  scrollProgress: number;
  theme: ReaderTheme;
}

export const ChapterProgressBar = React.memo(function ChapterProgressBar({
  scrollProgress,
  theme,
}: ChapterProgressBarProps) {
  return (
    <div className={`h-[3px] shrink-0 ${progressBg[theme]} rounded-none overflow-hidden`}>
      <div
        className={`h-full w-full ${progressFill[theme]} transition-transform duration-500 ease-out rounded-r-full origin-left`}
        style={{ transform: `scaleX(${scrollProgress})`, willChange: 'transform' }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// ChapterHeader — chapter number + title + ornament divider
// ---------------------------------------------------------------------------
interface ChapterHeaderProps {
  currentPage: number;
  chapterTitle: string;
}

export const ChapterHeader = React.memo(function ChapterHeader({
  currentPage,
  chapterTitle,
}: ChapterHeaderProps) {
  const t = useTranslations('reader');

  return (
    <div className="chapter-header">
      <span className="chapter-number">{t('reader_chapter', { num: currentPage + 1 })}</span>
      <h2 className="chapter-title">{chapterTitle}</h2>
      <div className="chapter-divider">
        <span className="chapter-ornament" />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// EmptyChapterState — shown when chapter content is blank
// ---------------------------------------------------------------------------
export const EmptyChapterState = React.memo(function EmptyChapterState() {
  const t = useTranslations('reader');

  return (
    <div className="text-center py-16 px-4">
      <svg
        aria-hidden="true"
        className="w-10 h-10 mx-auto mb-4 text-gray-500 dark:text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
        />
      </svg>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{t('empty_chapter')}</p>
      <p className="text-gray-500 dark:text-gray-400 text-xs">{t('empty_chapter_hint')}</p>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ChapterEndMarker — decorative divider at the end of chapter content
// ---------------------------------------------------------------------------
export const ChapterEndMarker = React.memo(function ChapterEndMarker() {
  return (
    <div className="chapter-end">
      <div className="chapter-end-line" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// useReaderViewLogic — all stateful hooks for ReaderView
// ---------------------------------------------------------------------------
interface ReaderViewLogicParams {
  bookId: string;
  chapterContent: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  contentRef?: RefObject<HTMLElement | null>;
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  onScrollProgress?: (progress: number) => void;
  currentSegment?: number;
  totalSegments?: number;
  onSegmentChange?: (segment: number) => void;
}

export function useReaderViewLogic({
  bookId,
  chapterContent,
  chapterTitle,
  currentPage,
  totalPages,
  onPageChange,
  contentRef,
  fontSize,
  fontFamily,
  lineHeight,
  onScrollProgress,
  currentSegment = 0,
  totalSegments = 1,
  onSegmentChange,
}: ReaderViewLogicParams) {
  const [scrollProgress, setScrollProgress] = useState(0);
  const selectingRef = useRef(false);

  useEffect(() => {
    let selTimer: ReturnType<typeof setTimeout> | undefined;
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        selectingRef.current = true;
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(() => { selectingRef.current = false; }, 600);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => { document.removeEventListener('selectionchange', onSelectionChange); if (selTimer) clearTimeout(selTimer); };
  }, []);

  const [purifyReady, setPurifyReady] = useState(false);

  useEffect(() => {
    preloadDOMPurify(() => setPurifyReady(true));
    preloadPrism();
  }, []);

  const articleRef = useRef<HTMLElement | null>(null);
  const contentDivRef = useRef<HTMLDivElement | null>(null);

  const sanitizedContent = useMemo(
    () => purifySync(chapterContent, PURIFY_CONFIG),
    [chapterContent, purifyReady],
  );

  const lastWrittenHtmlRef = useRef<string>('');

  useEffect(() => {
    const el = contentDivRef.current;
    if (!el) return;
    if (lastWrittenHtmlRef.current === sanitizedContent) return;
    el.innerHTML = sanitizedContent;
    lastWrittenHtmlRef.current = sanitizedContent;
  }, [sanitizedContent]);

  const articleStyle = useMemo(() => ({
    fontSize: `${fontSize}px`,
    ...(fontFamily ? { fontFamily } : {}),
    ...(lineHeight ? { lineHeight } : {}),
  }), [fontSize, fontFamily, lineHeight]);

  const containerRef = useRef<HTMLDivElement>(null);

  const scrollRafRef = useRef<number>(0);
  const updateScrollProgress = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const el = containerRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      const raw = maxScroll > 0 ? scrollTop / maxScroll : 1;
      const progress = Math.min(1, Math.max(0, raw));
      setScrollProgress(progress);
      onScrollProgress?.(progress);
    });
  }, [onScrollProgress]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

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

  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    highlightCodeBlocks(el).catch((err) => { warn("ReaderView: code highlighting failed", err); });
  }, [sanitizedContent]);

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

  useReaderKeyboardNav({ goNextPage, goPrevPage, currentPage, totalPages, onPageChange });
  useReaderSwipeNav({ containerRef, currentPage, totalPages, onPageChange, goNextPage, goPrevPage });

  useEffect(() => {
    if (articleRef.current) {
      articleRef.current.classList.remove('animate-chapter-fade');
      void articleRef.current.offsetWidth;
      articleRef.current.classList.add('animate-chapter-fade');
    }
  }, [chapterContent]);

  const overallProgress = totalPages > 1
    ? Math.round(((currentPage + scrollProgress) / totalPages) * 100)
    : Math.round(scrollProgress * 100);

  return {
    scrollProgress,
    selectingRef,
    articleRef,
    contentDivRef,
    containerRef,
    articleStyle,
    updateScrollProgress,
    goNextPage,
    goPrevPage,
    overallProgress,
  };
}
