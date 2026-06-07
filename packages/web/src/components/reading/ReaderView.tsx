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
 highlightCount?: number;
 bookmarkCount?: number;
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

 const articleStyle = useMemo(() => ({
  fontSize: `${fontSize}px`,
  ...(fontFamily ? { fontFamily } : {}),
  ...(lineHeight ? { lineHeight } : {}),
 }), [fontSize, fontFamily, lineHeight]);

 useEffect(() => {
 const el = contentDivRef.current;
 if (!el) return;
 if (lastWrittenHtmlRef.current === sanitizedContent) return;
 el.innerHTML = sanitizedContent;
 lastWrittenHtmlRef.current = sanitizedContent;
 }, [sanitizedContent]);

 const containerRef = useRef<HTMLDivElement>(null);

 const updateScrollProgress = useCallback(() => {
 const el = containerRef.current;
 if (!el) return;
 const { scrollTop, scrollHeight, clientHeight } = el;
 const maxScroll = scrollHeight - clientHeight;
 const raw = maxScroll > 0 ? scrollTop / maxScroll : 1;
 const progress = Math.min(1, Math.max(0, raw));
 setScrollProgress(progress);
 onScrollProgress?.(progress);
 }, [onScrollProgress]);

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
 highlightCodeBlocks(el).catch((err) => { console.warn("ReaderView: code highlighting failed", err); });
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
  {/* Thin chapter progress bar */}
  <div className={`h-[3px] shrink-0 ${progressBg[theme]} rounded-none overflow-hidden`}>
  <div
   className={`h-full w-full ${progressFill[theme]} transition-transform duration-500 ease-out rounded-r-full origin-left`}
   style={{ transform: `scaleX(${scrollProgress})`, willChange: 'transform' }}
  />
  </div>

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
   <div className="chapter-header">
    <span className="chapter-number">{t('reader_chapter', { num: currentPage + 1 })}</span>
    <h2 className="chapter-title">{chapterTitle}</h2>
    <div className="chapter-divider">
    <span className="chapter-ornament" />
    </div>
   </div>
   )}

   {!chapterContent?.trim() ? (
   <div className="text-center py-16 px-4">
    <svg aria-hidden="true" className="w-10 h-10 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
    <p className="text-gray-500 text-sm mb-1">{t('empty_chapter')}</p>
    <p className="text-gray-400 text-xs">{t('empty_chapter_hint')}</p>
   </div>
   ) : (
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
   )}

   <div className="chapter-end">
   <div className="chapter-end-line" />
   </div>
  </article>
  </div>

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
