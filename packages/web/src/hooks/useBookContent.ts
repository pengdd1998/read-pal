'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import type { Book, Chapter, Annotation } from '@read-pal/shared';

interface BookContentState {
  book: Book | null;
  chapters: Chapter[];
  currentChapter: number;
  annotations: Annotation[];
  loading: boolean;
  error: string;
  chapterContent: string;
  chapterTitle: string;
  setCurrentChapter: (idx: number) => void;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  setChapterFade: (fade: 'in' | 'out') => void;
  chapterFade: 'in' | 'out';
}

export function useBookContent(
  bookId: string,
  errorMessage: string,
  loadFailedMessage: string,
  connectFailedMessage: string,
): BookContentState {
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chapterFade, setChapterFade] = useState<'in' | 'out'>('in');

  // Data loading
  useEffect(() => {
    let cancelled = false;
    const loadBookContent = async () => {
      try {
        setLoading(true);
        const [bookResult, annotationsResult] = await Promise.all([
          api.get<{ book: Book; chapters: Chapter[]; content: string }>(`/api/upload/books/${bookId}/content`),
          api.get<Annotation[]>('/api/annotations', { book_id: bookId }).catch(() => null),
        ]);
        if (cancelled) return;
        if (bookResult.success && bookResult.data) {
          const data = bookResult.data;
          const chapterList = data.chapters ?? [];
          setBook(data.book);
          setChapters(chapterList);
          const startPage = data.book.currentPage || 0;
          setCurrentChapter(Math.min(startPage, Math.max(chapterList.length - 1, 0)));
          analytics.track('book_opened', { bookId, title: data.book.title });
        } else {
          setError(bookResult.error?.message || errorMessage);
        }
        if (annotationsResult?.success && annotationsResult.data) {
          const annData = annotationsResult.data;
          setAnnotations(Array.isArray(annData) ? annData : []);
        }
      } catch {
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

  return {
    book,
    chapters,
    currentChapter,
    annotations,
    loading,
    error,
    chapterContent,
    chapterTitle,
    setCurrentChapter,
    setAnnotations,
    setChapterFade,
    chapterFade,
  };
}
