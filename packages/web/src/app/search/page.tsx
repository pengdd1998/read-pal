'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Book {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
  coverUrl?: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const res = await api.get<Book[]>('/api/discovery/search', { q: query });
        if (res.success && res.data) {
          const data = res.data as unknown as Book[];
          setResults(Array.isArray(data) ? data : []);
        } else {
          setResults([]);
        }
      } catch {
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Search Library</h1>

        <div className="relative mb-8">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or author..."
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            autoFocus
          />
          {searching && <div className="absolute right-3 top-3.5 text-gray-400">Searching...</div>}
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded text-sm">
            {error}
          </div>
        )}

        {results.length > 0 ? (
          <div className="space-y-3">
            {results.map((book) => (
              <Link key={book.id} href={`/read/${book.id}`}
                className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-gray-900">{book.title}</h3>
                    <p className="text-sm text-gray-500">{book.author}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      book.status === 'completed' ? 'bg-green-100 text-green-700' :
                      book.status === 'reading' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {book.status}
                    </span>
                    {book.progress > 0 && (
                      <span className="text-sm text-gray-500">{Math.round(book.progress)}%</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : query.trim().length >= 2 && !searching && !error ? (
          <p className="text-gray-500 text-center py-8">No books found matching &quot;{query}&quot;</p>
        ) : (
          <p className="text-gray-400 text-center py-8">Type at least 2 characters to search</p>
        )}
      </div>
    </div>
  );
}
