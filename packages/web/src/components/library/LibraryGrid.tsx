'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';

interface LibraryGridProps {
  viewMode?: 'grid' | 'list';
}

export function LibraryGrid({ viewMode = 'grid' }: LibraryGridProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const uploaderRef = useRef<HTMLDivElement>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get<Book[]>('/api/books');

      if (response.success && response.data) {
        const data = response.data as unknown as Book[];
        setBooks(Array.isArray(data) ? data : []);
      } else {
        setError(response.error?.message || 'Failed to load library');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleUploadComplete = (newBook: Book) => {
    setBooks((prev) => [newBook, ...prev]);
  };

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: Book }>('/api/books/seed-sample');
      if (res.success && res.data) {
        const data = res.data as unknown as { book: Book };
        if (data.book) {
          setBooks((prev) => [data.book, ...prev]);
        }
      }
    } catch {
      // Silently fail
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Uploader skeleton */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-12 animate-pulse" />
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] bg-gray-100 dark:bg-gray-800 rounded-xl mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasBooks = books.length > 0;

  return (
    <div className="space-y-8">
      {/* Error */}
      {error && (
        <div className="animate-slide-up p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
          <div className="flex items-center justify-between">
            <p>{error}</p>
            <button
              onClick={loadLibrary}
              className="ml-4 px-3 py-1.5 bg-red-100 dark:bg-red-900 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Upload area — always visible at top */}
      <div ref={uploaderRef} className="animate-fade-in">
        <BookUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Empty state with prominent CTA */}
      {!hasBooks && !error && (
        <div className="animate-scale-in">
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-5 text-primary-300 dark:text-primary-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="16" y2="7" />
                <line x1="9" y1="11" x2="14" y2="11" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white text-xl mb-2">
              Your library is empty
            </h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mb-8">
              Upload an EPUB or PDF above, or try a sample book to explore all features
              including AI chat, highlights, and annotations.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleSeedSample}
                disabled={seeding}
                className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {seeding ? 'Loading sample...' : 'Try a sample book'}
              </button>
            </div>

            <p className="text-xs text-gray-400 mt-6">
              Drag and drop a file onto the upload area above to add your own books
            </p>
          </div>
        </div>
      )}

      {/* Books Grid / List */}
      {hasBooks && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {books.length} book{books.length !== 1 ? 's' : ''} in your library
            </p>
            <button
              onClick={handleSeedSample}
              disabled={seeding}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seeding ? 'Loading...' : '+ Add sample book'}
            </button>
          </div>
          <div className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5'
              : 'flex flex-col gap-3'
          }>
            {books.map((book, i) => (
              <div key={book.id} className={`stagger-${Math.min(i + 1, 6)} animate-slide-up`}>
                <BookCard
                  id={book.id}
                  title={book.title}
                  author={book.author}
                  coverUrl={book.coverUrl}
                  progress={Math.round((book.progress ?? 0) * 100)}
                  status={book.status}
                  currentPage={book.currentPage || 0}
                  totalPages={book.totalPages || 0}
                  lastReadAt={book.lastReadAt}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
