'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';

export function LibraryGrid() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <div className="space-y-8">
      {/* Upload */}
      <div className="animate-fade-in">
        <BookUploader onUploadComplete={handleUploadComplete} />
      </div>

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

      {/* Books Grid */}
      {books.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
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
      ) : (
        !error && (
          <div className="card text-center py-20 animate-scale-in">
            <div className="text-6xl mb-5 opacity-40">{'\uD83D\uDCDA'}</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Your library is empty
            </h2>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6 leading-relaxed">
              Upload your first EPUB or PDF to start reading with your AI companions.
            </p>
          </div>
        )
      )}
    </div>
  );
}
