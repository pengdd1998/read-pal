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

interface Highlight {
  id: string;
  content: string;
  type: string;
  bookId: string;
  bookTitle?: string;
  createdAt: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);

  // Load recent books for recommendations when no search
  useEffect(() => {
    api.get<Book[]>('/api/books')
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data as unknown as Book[];
          setRecentBooks(Array.isArray(data) ? data.slice(0, 6) : []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setHighlights([]);
      setError(null);
      setSearched(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      setSearched(false);
      try {
        const [bookRes, annRes] = await Promise.all([
          api.get<Book[]>('/api/discovery/search', { q: query }),
          api.get<any[]>('/api/annotations', { bookId: '', limit: 100 }),
        ]);

        if (bookRes.success && bookRes.data) {
          const data = bookRes.data as unknown as Book[];
          setResults(Array.isArray(data) ? data : []);
        } else {
          setResults([]);
        }

        // Filter annotations by query
        if (annRes.success && annRes.data) {
          const allAnnotations = annRes.data as unknown as any[];
          const q = query.toLowerCase();
          const matches = allAnnotations
            .filter((a) => (a.content || '').toLowerCase().includes(q) || (a.note || '').toLowerCase().includes(q))
            .slice(0, 10);
          setHighlights(matches.map((a) => ({
            id: a.id,
            content: a.content || a.note || '',
            type: a.type,
            bookId: a.bookId,
            createdAt: a.createdAt,
          })));
        } else {
          setHighlights([]);
        }

        setSearched(true);
      } catch {
        setError('Search failed. Please try again.');
        setResults([]);
        setHighlights([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results.length > 0 || highlights.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Search</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">Find books, highlights, and notes across your library</p>
      </div>

      {/* Search Input */}
      <div className="relative mb-6 sm:mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search books, highlights, notes..."
          className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 text-base sm:text-lg shadow-sm transition-all duration-200"
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

      {/* Search Results */}
      {searched ? (
        hasResults ? (
          <div className="space-y-6">
            {/* Book results */}
            {results.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Books ({results.length})</h2>
                <div className="space-y-3">
                  {results.map((book) => (
                    <Link key={book.id} href={`/read/${book.id}`}
                      className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{book.title}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{book.author}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                            book.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
                            book.status === 'reading' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                            'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
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
              </div>
            )}

            {/* Highlight/Note results */}
            {highlights.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Highlights & Notes ({highlights.length})</h2>
                <div className="space-y-2">
                  {highlights.map((h) => (
                    <Link key={h.id} href={`/read/${h.bookId}`}
                      className="block bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30 p-4 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200">
                      <div className="flex items-start gap-2">
                        <span className="text-amber-500 text-sm mt-0.5">
                          {h.type === 'highlight' ? '\u270D\uFE0F' : h.type === 'note' ? '\uD83D\uDCDD' : '\uD83D\uDD16'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{h.content}</p>
                          <p className="text-xs text-gray-400 mt-1">{h.type} &middot; {new Date(h.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-1">No results for &quot;{query}&quot;</p>
            <p className="text-sm text-gray-400">Try different keywords or check your spelling</p>
          </div>
        )
      ) : query.trim().length < 2 && !searching ? (
        /* Default state — recommendations */
        <div>
          {recentBooks.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Your Library</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentBooks.map((book) => (
                  <Link key={book.id} href={`/read/${book.id}`}
                    className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200">
                    <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{'\uD83D\uDCD6'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">{book.title}</h3>
                      <p className="text-xs text-gray-500 truncate">{book.author}</p>
                      {book.progress > 0 && (
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-1.5">
                          <div className="bg-amber-400 rounded-full h-1" style={{ width: `${Math.min(100, Math.round(book.progress))}%` }} />
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
                <span className="text-3xl">{'\uD83D\uDD0D'}</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Search across your library
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto leading-relaxed">
                Find books by title or author, and search across all your highlights and notes.
              </p>
              <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
                Add books to get started
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
