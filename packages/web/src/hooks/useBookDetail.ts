'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useBackgroundApi } from '@/hooks/useApi';
import type {
  BookData,
  AnnotationStats,
  AnnotationItem,
  ReadingLogEntry,
} from '@/types/book';

export function useBookDetail(bookId: string, t: (key: string) => string) {
  const [book, setBook] = useState<BookData | null>(null);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats>({
    highlights: 0,
    notes: 0,
    bookmarks: 0,
  });
  const [allAnnotations, setAllAnnotations] = useState<AnnotationItem[]>([]);
  const [hasPersonalBook, setHasPersonalBook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readingLog, setReadingLog] = useState<ReadingLogEntry[]>([]);
  const [readingWpm, setReadingWpm] = useState<number>(0);
  const [flashcardCount, setFlashcardCount] = useState<number>(0);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [zoteroConnected, setZoteroConnected] = useState(false);

  const { fetch: bgFetch } = useBackgroundApi();
  const currentBookIdRef = useRef(bookId);
  currentBookIdRef.current = bookId;

  useEffect(() => {
    let cancelled = false;

    // Reset state when navigating to a different book
    setLoading(true);
    setError('');
    setBook(null);
    setAnnotationStats({ highlights: 0, notes: 0, bookmarks: 0 });
    setAllAnnotations([]);
    setHasPersonalBook(false);
    setReadingLog([]);
    setReadingWpm(0);
    setFlashcardCount(0);
    setTags([]);

    (async () => {
      try {
        const [res, annRes] = await Promise.all([
          api.get<BookData>(`/api/books/${bookId}`),
          api.get<AnnotationItem[]>('/api/annotations', {
            book_id: bookId,
            per_page: 200,
          }),
        ]);
        if (cancelled) return;
        if (res.success && res.data) {
          setBook(res.data);
        } else {
          setError(t('bookNotFound'));
        }
        if (annRes.success && annRes.data) {
          const annotations = Array.isArray(annRes.data) ? annRes.data : [];
          setAnnotationStats({
            highlights: annotations.filter((a) => a.type === 'highlight')
              .length,
            notes: annotations.filter((a) => a.type === 'note').length,
            bookmarks: annotations.filter((a) => a.type === 'bookmark').length,
          });
          setAllAnnotations(annotations);
        }
      } catch {
        if (!cancelled) setError(t('failedToLoad'));
      }
      if (!cancelled) setLoading(false);
    })();

    // Background fetches -- non-critical, silenced errors
    // Guard against stale writes when bookId changes during in-flight requests
    const guard = <T>(setter: (v: T) => void) => (data: T) => {
      if (currentBookIdRef.current === bookId) setter(data);
    };

    bgFetch<Array<{ bookId: string; total: number }>>(
      '/api/flashcards/decks',
      guard((data) => {
        const deck = data.find((d) => d.bookId === bookId);
        if (deck) setFlashcardCount(deck.total);
      }),
    );
    bgFetch<Array<{ name: string; count: number }>>(
      `/api/annotations/tags?bookId=${bookId}`,
      guard((data) => {
        if (Array.isArray(data)) setTags(data);
      }),
    );
    bgFetch<{ format: string }>(`/api/memory-books/${bookId}`, guard((data) => {
      if (data.format === 'personal_book') setHasPersonalBook(true);
    }));
    bgFetch<ReadingLogEntry[]>(
      `/api/reading-sessions/book/${bookId}/log?limit=5`,
      guard((data) => {
        if (Array.isArray(data)) setReadingLog(data);
      }),
    );
    bgFetch<{ currentWpm: number }>('/api/stats/reading-speed', guard((data) => {
      if (data.currentWpm) setReadingWpm(data.currentWpm);
    }));
    bgFetch<Record<string, unknown>>('/api/settings', guard((data) => {
      if (data?.['zoteroApiKey'] && data?.['zoteroUserId']) {
        setZoteroConnected(true);
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [bookId, bgFetch, t]);

  return {
    book,
    annotationStats,
    allAnnotations,
    hasPersonalBook,
    loading,
    error,
    setError,
    readingLog,
    readingWpm,
    flashcardCount,
    tags,
    zoteroConnected,
    setZoteroConnected,
  };
}
