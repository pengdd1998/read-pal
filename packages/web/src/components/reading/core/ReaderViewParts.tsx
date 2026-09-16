'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { progressBg, progressFill, type ReaderTheme } from '@/lib/reader/reader-theme';
import { purifySync, preloadDOMPurify } from '@/lib/render/dompurify';
import { PURIFY_CONFIG } from '@/lib/render/dompurify-config';
import { highlightCodeBlocks, preloadPrism } from '@/lib/render/syntax-highlight';
import { useScrollPersistence } from '@/hooks/useScrollPersistence';
import { useChapterTimeLeft } from '@/hooks/useChapterTimeLeft';
import { useReaderKeyboardNav } from '@/hooks/useReaderKeyboardNav';
import { useReaderSwipeNav } from '@/hooks/useReaderSwipeNav';
import { api } from '@/lib/api/client';
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
    <div id="tour-progress" className={`h-[3px] shrink-0 ${progressBg[theme]} rounded-none overflow-hidden`}>
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
  chapterTitle: string;
}

/**
 * Front/back-matter chapter titles (序, 后记, 前言, Preface…) are real
 * reading units but not NUMBERED chapters — labeling them "第 2 章" made
 * the book's own Chapter 1 show as Chapter 2. These show their title as
 * the label instead of a number; numbered chapters keep 第 N 章.
 */
export const ChapterHeader = React.memo(function ChapterHeader({
  chapterTitle,
}: ChapterHeaderProps) {
  return (
    <div className="chapter-header">
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
// ChapterEndMarker — divider + next-chapter affordance at chapter end
// (Readwise-style: a boundary you can act on, not just see)
// ---------------------------------------------------------------------------
interface ChapterEndMarkerProps {
  hasNextChapter: boolean;
  nextChapterTitle?: string;
  onNextChapter: () => void;
}

export const ChapterEndMarker = React.memo(function ChapterEndMarker({
  hasNextChapter,
  nextChapterTitle,
  onNextChapter,
}: ChapterEndMarkerProps) {
  const t = useTranslations('reader');
  return (
    <div className="chapter-end">
      <div className="chapter-end-line" />
      {hasNextChapter && (
        <button
          type="button"
          onClick={onNextChapter}
          className="chapter-next-affordance group"
          aria-label={t('next_chapter_cta', { title: nextChapterTitle || '' })}
        >
          <span className="chapter-next-label">
            {t('next_chapter_label')}
            {nextChapterTitle ? ` · ${nextChapterTitle}` : ''}
          </span>
          <span className="chapter-next-arrow" aria-hidden="true">→</span>
        </button>
      )}
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
  currentPage,
  totalPages,
  onPageChange,
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

  // Footnote reference clicks: the stored EPUB content keeps the original
  // anchors, and many EPUBs (e.g. InDesign exports) write markers as
  // cross-file links (href="part0001.html#note_1") WITHOUT the
  // rp-footnote-ref class. Without interception the click leaves the SPA
  // and errors. Intercept any anchor whose href fragment names a footnote
  // definition (note_N / fn_N / footnote_N / endnote_N, excluding noteBack
  // backlink markers), then show a popover with the definition from the
  // same chapter's DOM (id = href target).
  const [footnotePopover, setFootnotePopover] = useState<{
    marker: string;
    html: string;
    anchorEl: HTMLElement;
  } | null>(null);
  // Lazily-fetched parse-time definition map: definitions may live in a
  // different chapter than the marker (InDesign EPUBs split them), so the
  // same-DOM lookup alone cannot resolve every marker.
  const footnoteDefsRef = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    const el = contentDivRef.current;
    if (!el) return;
    // noteBack_* is this book family's marker id; fnref_* is EPUB convention
    // for the reference side. Both name markers, not definitions.
    const isDefinitionFragment = (frag: string) =>
      /^(?:note(?!back)|fn(?!ref)|footnote|endnote)[\w.-]*$/i.test(frag);
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const resolveRemoteDefinition = async (
      marker: string,
      anchorId: string,
    ): Promise<string> => {
      if (footnoteDefsRef.current === null) {
        const resp = await api.get<{ definitions?: Record<string, string> }>(
          `/api/v1/books/${bookId}/footnotes`,
        );
        footnoteDefsRef.current = resp.data?.definitions ?? {};
      }
      const text = footnoteDefsRef.current[anchorId];
      return text
        ? `<p>${escapeHtml(text)}</p>`
        : `<em>${escapeHtml(marker)} — see the notes section at the end of the book.</em>`;
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest<HTMLElement>('a');
      if (!anchor) return;
      if (!anchor.classList.contains('rp-footnote-ref')) {
        const href = anchor.getAttribute('href') || '';
        const frag = href.includes('#') ? (href.split('#')[1] || '') : '';
        if (!isDefinitionFragment(frag)) return;
      }
      e.preventDefault();
      e.stopPropagation();
      const marker = (anchor.textContent || '').trim();
      const href = anchor.getAttribute('href') || '';
      const anchorId = href.split('#')[1] || '';
      let bodyEl: HTMLElement | null = anchorId
        ? document.getElementById(anchorId)
        : null;
      if (bodyEl && /^[\[\]0-9\s]+$/.test((bodyEl.textContent || '').trim())) {
        // Definition anchor holds only the bracket number — the note text
        // lives in its wrapper (<p class="notecontent">…</p>).
        bodyEl = bodyEl.parentElement;
      }
      if (bodyEl) {
        // Neutralize backlink anchors inside the definition so no click in
        // the popover can navigate out of the SPA.
        const clone = bodyEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('a').forEach((a) => {
          const span = el.ownerDocument.createElement('span');
          span.innerHTML = a.innerHTML;
          a.replaceWith(span);
        });
        setFootnotePopover({
          marker,
          html: clone.innerHTML,
          anchorEl: anchor,
        });
      } else {
        // Definition may be in another chapter's raw content — resolve it
        // from the book's parse-time definition map.
        void resolveRemoteDefinition(marker, anchorId).then((html) => {
          setFootnotePopover({ marker, html, anchorEl: anchor });
        });
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
    // Re-bind when chapter content arrives: the content div is rendered
    // conditionally, so on a cold load it does not exist at first effect
    // run and the listener must attach once it mounts (FN1/FN2 miss).
  }, [bookId, sanitizedContent]);

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
  useReaderSwipeNav({ containerRef, goNextPage, goPrevPage });

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

  // Kindle-style chapter time-left: words remaining ÷ reading rate.
  const chapterMinutesLeft = useChapterTimeLeft(chapterContent, scrollProgress);

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
    chapterMinutesLeft,
    footnotePopover,
    setFootnotePopover,
  };
}
