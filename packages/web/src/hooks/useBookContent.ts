'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { warn } from '@/lib/logger';
import { splitChapterIntoPages, DEFAULT_MAX_CHARS_PER_PAGE, type PageSegment } from '@/lib/chapter-paginator';
import type { Book, Chapter, Annotation } from '@read-pal/shared';

interface BookContentState {
  book: Book | null;
  chapters: Chapter[];
  currentChapter: number;
  annotations: Annotation[];
  loading: boolean;
  error: string;
  annotationsError: boolean;
  chapterContent: string;
  chapterTitle: string;
  setCurrentChapter: (idx: number) => void;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  setChapterFade: (fade: 'in' | 'out') => void;
  chapterFade: 'in' | 'out';
  // Pagination
  segments: PageSegment[];
  currentSegment: number;
  totalSegments: number;
  pageContent: string;
  setCurrentSegment: (idx: number) => void;
}

export function useBookContent(
  bookId: string,
  errorMessage: string,
  connectFailedMessage: string,
): BookContentState {
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [annotationsError, setAnnotationsError] = useState(false);
  const [chapterFade, setChapterFade] = useState<'in' | 'out'>('in');

  // Data loading
  useEffect(() => {
    let cancelled = false;
    const loadBookContent = async () => {
      try {
        setLoading(true);
        setError('');
        setAnnotationsError(false);
        const [bookResult, annotationsResult] = await Promise.all([
          api.get<{ book: Book; chapters: Chapter[]; content: string }>(`/api/upload/books/${bookId}/content`, { _t: Date.now() }),
          api.get<Annotation[]>('/api/annotations', { book_id: bookId }).catch((err) => {
            warn('useBookContent: annotations fetch failed', err);
            if (!cancelled) setAnnotationsError(true);
            return null;
          }),
        ]);
        if (cancelled) return;
        if (bookResult.success && bookResult.data) {
          const data = bookResult.data;
          const chapterList = data.chapters ?? [];
          setBook(data.book);
          setChapters(chapterList);
          const startPage = data.book.currentPage || 0;
          setCurrentChapter(Math.min(startPage, Math.max(chapterList.length - 1, 0)));
          // Restore saved segment position
          const savedSegment = data.book.currentSegment;
          if (savedSegment && savedSegment > 0) {
            setCurrentSegment(savedSegment);
          }
          analytics.track('book_opened', { bookId, title: data.book.title });
        } else {
          setError(errorMessage);
        }
        if (annotationsResult?.success && annotationsResult.data) {
          const annData = annotationsResult.data;
          setAnnotations(Array.isArray(annData) ? annData : []);
        }
      } catch (err) {
        warn('useBookContent: fetch failed', err);
        if (!cancelled) setError(connectFailedMessage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBookContent();
    return () => { cancelled = true; };
  }, [bookId, errorMessage, connectFailedMessage]);

  const chapterContent = chapters[currentChapter]?.rawContent || chapters[currentChapter]?.content || '';
  const chapterTitle = chapters[currentChapter]?.title || book?.title || '';

  // Split current chapter into page segments
  const segments = useMemo(
    () => splitChapterIntoPages(chapterContent, DEFAULT_MAX_CHARS_PER_PAGE),
    [chapterContent],
  );
  const totalSegments = segments.length;

  // Synchronous clamp: when chapter changes or savedSegment is restored from
  // the server, currentSegment may exceed the new chapter's segment count for
  // one render before the useEffect below runs. Reading segments[oob] returns
  // undefined and the page renders blank for a frame. Compute the safe index
  // inline so the user never sees an empty page.
  const safeSegmentIdx = Math.min(currentSegment, Math.max(0, totalSegments - 1));

  // Current page content (single segment)
  const pageContent = useMemo(
    () => segments[safeSegmentIdx]?.html || '',
    [segments, safeSegmentIdx],
  );

  // Reset segment when chapter changes
  const handleSetCurrentChapter = useCallback((idx: number) => {
    setCurrentChapter(idx);
    setCurrentSegment(0);
  }, []);

  // Clamp segment state so it stays in sync with the synchronous clamp above.
  useEffect(() => {
    if (currentSegment !== safeSegmentIdx) {
      setCurrentSegment(safeSegmentIdx);
    }
  }, [safeSegmentIdx, currentSegment]);

  return {
    book,
    chapters,
    currentChapter,
    annotations,
    loading,
    error,
    annotationsError,
    chapterContent,
    chapterTitle,
    setCurrentChapter: handleSetCurrentChapter,
    setAnnotations,
    setChapterFade,
    chapterFade,
    // Pagination
    segments,
    currentSegment,
    totalSegments,
    pageContent,
    setCurrentSegment,
  };
}
