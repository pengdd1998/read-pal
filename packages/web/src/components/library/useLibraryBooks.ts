'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { warn } from '@/lib/logger';

interface UseLibraryBooksReturn {
  books: Book[];
  loading: boolean;
  error: string;
  seeding: boolean;
  mountedRef: React.MutableRefObject<boolean>;
  handleRetry: () => () => void;
  handleUploadComplete: (newBook: Book) => void;
  handleDeleteBook: (id: string) => Promise<void>;
  handleSeedSample: () => Promise<void>;
  handleTagsChange: (id: string, newTags: string[]) => void;
  handleBookAdded: (book: Book) => void;
}

export function useLibraryBooks(): UseLibraryBooksReturn {
  const t = useTranslations('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const mountedRef = useRef(true);
  const deletingRef = useRef<Set<string>>(new Set());

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const fetchBooks = useCallback(() => {
    let stale = false;
    setLoading(true);
    setError('');
    api.get<Book[]>('/api/books')
      .then((response) => {
        if (stale) return;
        if (response.success && response.data) {
          setBooks(Array.isArray(response.data) ? response.data : []);
        } else {
          setError(t('failed_load_library'));
        }
      })
      .catch((err) => {
        if (stale) return;
        warn('LibraryGrid: failed to load library', err);
        setError(t('failed_connect_server'));
      })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [t]);

  useEffect(() => { return fetchBooks(); }, [fetchBooks]);

  const handleRetry = useCallback(() => {
    return fetchBooks();
  }, [fetchBooks]);

  const handleUploadComplete = (newBook: Book) => {
    if (!newBook?.id) return;
    setBooks((prev) => [newBook, ...prev]);
  };

  const handleDeleteBook = async (id: string) => {
    if (deletingRef.current.has(id)) return;
    deletingRef.current.add(id);
    const prev = books;
    setBooks((bs) => bs.filter((b) => b.id !== id));
    try {
      const res = await api.delete(`/api/books/${id}`);
      if (!mountedRef.current) return;
      if (!res.success) {
        warn('LibraryGrid: delete returned success=false', res.error);
        setBooks(prev);
      }
    } catch (err) {
      warn('LibraryGrid: failed to delete book', err);
      if (!mountedRef.current) return;
      setBooks(prev);
    } finally {
      if (mountedRef.current) deletingRef.current.delete(id);
    }
  };

  const handleSeedSample = async () => {
    if (seeding) return;
    try {
      setSeeding(true);
      const res = await api.post<{ book: Book }>('/api/books/seed-sample');
      if (!mountedRef.current) return;
      if (res.success && res.data?.book) {
        setBooks((prev) => [res.data!.book, ...prev]);
      } else {
        setError(t('failed_seed_sample'));
      }
    } catch (err) {
      warn('LibraryGrid: failed to seed sample book', err);
      if (!mountedRef.current) return;
      setError(t('failed_seed_sample'));
    } finally {
      if (mountedRef.current) setSeeding(false);
    }
  };

  const handleTagsChange = useCallback((id: string, newTags: string[]) => {
    setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, tags: newTags } : b)));
  }, []);

  const handleBookAdded = useCallback((book: Book) => {
    setBooks((prev) => [book, ...prev]);
  }, []);

  return {
    books,
    loading,
    error,
    seeding,
    mountedRef,
    handleRetry,
    handleUploadComplete,
    handleDeleteBook,
    handleSeedSample,
    handleTagsChange,
    handleBookAdded,
  };
}
