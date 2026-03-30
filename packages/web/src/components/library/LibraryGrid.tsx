'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { BookCard } from './BookCard';
import { BookUploader } from './BookUploader';

export function LibraryGrid() {
  const [books, setBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLibrary = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/books');

      if (response.success) {
        setBooks((response.data as any[]) || []);
      } else {
        setError('Failed to load library');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const handleUploadComplete = (newBook: any) => {
    setBooks([newBook, ...books]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Upload Section */}
      <div className="mb-8">
        <BookUploader onUploadComplete={handleUploadComplete} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Books Grid */}
      {books.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {books.map((book) => (
            <BookCard
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              progress={book.progress || 0}
              status={book.status}
              currentPage={book.currentPage || 0}
              totalPages={book.totalPages || 0}
              lastReadAt={book.lastReadAt}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-semibold mb-2">Your library is empty</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Upload your first EPUB or PDF to start reading with AI companions
          </p>
        </div>
      )}
    </div>
  );
}
