'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api/client';
import { warn } from '@/lib/logger';
import type {
  BookData,
  AnnotationStats,
  AnnotationItem,
  ReadingLogEntry,
} from '@/types/book';


/**
 * Fire-and-forget API call for secondary/non-critical data.
 * Silently handles errors (no console noise).
 * The generic is on the fetch method, not the hook, so you can call
 * fetch<DifferentType> for each background request.
 */
export function useBackgroundApi() {
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Reset on every (re)mount so the cancel flag survives React StrictMode's
    // mount→cleanup→remount cycle in dev. Without this, the cleanup sets the
    // ref true and the second mount never resets it, leaving every background
    // fetch permanently cancelled (tags, flashcards, reading-speed, etc. would
    // never populate on the book-detail page in dev).
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const fetch = useCallback(
    <T>(url: string, setter: (data: T) => void): void => {
      api.get<T>(url)
        .then((res) => {
          if (!cancelledRef.current && res.success && res.data != null) {
            setter(res.data);
          }
        })
        .catch((err) => {
          warn('[useBackgroundApi]', url, err);
        });
    },
    [],
  );

  return { fetch };
}

export function useBookDetail(bookId: string, t: (key: string) => string) {
  const tRef = useRef(t);
  tRef.current = t;
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
  const [readingPph, setReadingPph] = useState<number>(0);
  const [flashcardCount, setFlashcardCount] = useState<number>(0);
  const [tags, setTags] = useState<Array<{ name: string; count: number }>>([]);
  const [zoteroConnected, setZoteroConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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
    setReadingPph(0);
    setFlashcardCount(0);
    setTags([]);

    (async () => {
      try {
        const [res, annRes] = await Promise.all([
          api.get<BookData>(`/api/v1/books/${bookId}`),
          api.get<AnnotationItem[]>('/api/v1/annotations', {
            book_id: bookId,
            per_page: 200,
          }),
        ]);
        if (cancelled) return;
        if (res.success && res.data) {
          setBook(res.data);
        } else {
          setError(tRef.current('bookNotFound'));
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
      } catch (err) {
        warn('useBookDetail: fetch failed', err);
        if (!cancelled) setError(tRef.current('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Background fetches -- non-critical, silenced errors
    // Guard against stale writes when bookId changes during in-flight requests
    const guard = <T>(setter: (v: T) => void) => (data: T) => {
      if (currentBookIdRef.current === bookId) setter(data);
    };

    bgFetch<{ decks: Array<{ bookId: string; total: number }> }>(
      '/api/v1/flashcards/decks',
      guard((data) => {
        // Backend returns {decks, totalCards, totalDue, totalReviewed}.
        // Previously typed as a bare array — calling .find on the wrapper
        // threw and silently dropped the flashcard count.
        const deck = data?.decks?.find((d) => d.bookId === bookId);
        if (deck) setFlashcardCount(deck.total);
      }),
    );
    bgFetch<Array<{ name: string; count: number }>>(
      `/api/v1/annotations/tags?bookId=${bookId}`,
      guard((data) => {
        if (Array.isArray(data)) setTags(data);
      }),
    );
    bgFetch<{ format: string }>(`/api/v1/memory-books/${bookId}`, guard((data) => {
      if (data.format === 'personal_book') setHasPersonalBook(true);
    }));
    bgFetch<ReadingLogEntry[]>(
      `/api/v1/reading-sessions/book/${bookId}/log?limit=5`,
      guard((data) => {
        if (Array.isArray(data)) setReadingLog(data);
      }),
    );
    // Pages/hour is the reliable speed metric — the backend's derived wpm
    // assumes 250 words/page which is wildly off. ETA is computed from pph.
    bgFetch<{ averagePagesPerHour: number }>('/api/v1/stats/reading-speed', guard((data) => {
      if (data.averagePagesPerHour) setReadingPph(data.averagePagesPerHour);
    }));
    bgFetch<Record<string, unknown>>('/api/v1/settings', guard((data) => {
      if (data?.['zoteroApiKey'] && data?.['zoteroUserId']) {
        setZoteroConnected(true);
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [bookId, bgFetch, retryCount]);

  const refetch = useCallback(() => setRetryCount((c) => c + 1), []);

  return {
    book,
    annotationStats,
    allAnnotations,
    hasPersonalBook,
    loading,
    error,
    setError,
    readingLog,
    readingPph,
    flashcardCount,
    tags,
    zoteroConnected,
    setZoteroConnected,
    refetch,
  };
}
