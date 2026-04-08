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
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      setSearched(false);
      try {
        const res = await api.get<Book[]>('/api/discovery/search', { q: query });
        if (res.success && res.data) {
          const data = res.data as unknown as Book[];
          setResults(Array.isArray(data) ? data : []);
        } else {
          setResults([]);
        }
        setSearched(true);
      } catch {
        setError('Search failed. Please try again.');
        setResults([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="min-h-screen bg-[#f9f5f0] dark:bg-gray-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] dark:text-white">Search</h1>
          <p className="text-[#5c5c5c] dark:text-gray-400 mt-1">Find books, highlights, and notes across your library</p>
        </div>

        {/* Search Input */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across your library..."
            className="w-full pl-12 pr-4 py-4 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-gray-900 text-[#1e3a5f] dark:text-white placeholder-[#a3a3a3] dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 text-lg shadow-sm transition-all duration-200"
            autoFocus
          />
          {searching && (
            <div className="absolute right-4 top-4">
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 ? (
          <div className="space-y-3">
            {results.map((book) => (
              <Link key={book.id} href={`/read/${book.id}`}
                className="block bg-white dark:bg-gray-900 rounded-xl border border-[#f0e9e0] dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-[#1e3a5f] dark:text-white">{book.title}</h3>
                    <p className="text-sm text-[#5c5c5c] dark:text-gray-400">{book.author}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      book.status === 'completed' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' :
                      book.status === 'reading' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                      'bg-gray-100 dark:bg-gray-800 text-[#5c5c5c] dark:text-gray-400'
                    }`}>
                      {book.status}
                    </span>
                    {book.progress > 0 && (
                      <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{Math.round(book.progress)}%</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : searched && query.trim().length >= 2 && !searching && !error ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-[#5c5c5c] dark:text-gray-400 mb-1">No books found matching &quot;{query}&quot;</p>
            <p className="text-sm text-[#a3a3a3] dark:text-gray-500">Try different keywords or check your spelling</p>
          </div>
        ) : query.trim().length < 2 && !searching ? (
          /* Initial state — Coming Soon notice + prompt */
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
              <span className="text-3xl">{'\uD83D\uDD0D'}</span>
            </div>
            <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-white mb-2">
              Search across your library
            </h2>
            <p className="text-[#5c5c5c] dark:text-gray-400 mb-6 max-w-md mx-auto leading-relaxed">
              Find books by title or author. Full-text search across highlights, notes, and chapter content is coming soon.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30">
              <span className="text-sm">{'\u2728'}</span>
              <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">Deeper search coming soon — we&apos;re building this for you!</span>
            </div>
          </div>
        ) : null}

        {/* Back link */}
        <div className="mt-12">
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#f0e9e0] dark:bg-gray-800 text-[#1e3a5f] dark:text-gray-200 hover:bg-amber-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
