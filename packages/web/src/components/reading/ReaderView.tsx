'use client';

import React, { type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { themeClasses, type ReaderTheme } from '@/lib/reader-theme';
import { ChapterDropdown } from '@/components/reading/ChapterDropdown';
import { ReaderFooter } from '@/components/reading/ReaderFooter';
import {
  ChapterProgressBar,
  ChapterHeader,
  EmptyChapterState,
  ChapterEndMarker,
  useReaderViewLogic,
} from '@/components/reading/ReaderViewParts';

interface ChapterItem {
  title: string;
}

const OVERSCROLL_STYLE: React.CSSProperties = { overscrollBehavior: 'contain' };

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
  onScrollProgress?: (progress: number) => void;
  onPauseAutoHide?: () => void;
  onResumeAutoHide?: () => void;
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
  onScrollProgress,
  onPauseAutoHide,
  onResumeAutoHide,
  currentSegment = 0,
  totalSegments = 1,
  onSegmentChange,
}: ReaderViewProps) {
  const t = useTranslations('reader');

  const {
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
  } = useReaderViewLogic({
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
    currentSegment,
    totalSegments,
    onSegmentChange,
  });

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
      {/* Screen reader chapter announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {chapterTitle && t('chapter_announcement', { num: currentPage + 1, title: chapterTitle })}
      </div>

      <ChapterProgressBar scrollProgress={scrollProgress} theme={theme} />

      {/* Scrollable reading area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto min-h-0 reading-scroll-container"
        style={OVERSCROLL_STYLE}
        onScroll={updateScrollProgress}
      >
        <article
          ref={articleRef}
          className="reading-mode select-text animate-chapter-fade"
          data-theme={theme}
          style={articleStyle}
        >
          {chapterTitle && currentSegment === 0 && (
            <ChapterHeader currentPage={currentPage} chapterTitle={chapterTitle} />
          )}

          {!chapterContent?.trim() ? (
            <EmptyChapterState />
          ) : (
            <div
              ref={(el) => {
                contentDivRef.current = el;
                if (contentRef) {
                  (contentRef as React.MutableRefObject<HTMLElement | null>).current = el;
                }
              }}
              className={`prose prose-lg max-w-none reader-content ${theme === 'dark' ? 'prose-invert' : ''}`}
              suppressHydrationWarning
            />
          )}

          <ChapterEndMarker />
        </article>
      </div>

      <ReaderFooter
        currentPage={currentPage}
        totalPages={totalPages}
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
