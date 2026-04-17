'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { usePageTitle } from '@/hooks/usePageTitle';

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

interface Passage {
  id: string;
  score: number;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  chapterId?: string;
  chapterTitle?: string;
  chunkIndex: number;
  text: string;
}

export default function SearchPage() {
  usePageTitle('Search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [filter, setFilter] = useState<'all' | 'books' | 'highlights' | 'notes' | 'passages'>('all');

  // Load recent books for recommendations when no search
  useEffect(() => {
    api.get<Book[]>('/api/books')
      .then((res) => {
        if (res.success && res.data) {
          const data = res.data;
          setRecentBooks(Array.isArray(data) ? data.slice(0, 6) : []);
        }
      })
      .catch(() => {
        /* Recent books load failure — non-critical, page still works */
      });
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setHighlights([]);
      setPassages([]);
      setError(null);
      setSearched(false);
      setFilter('all');
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setError(null);
      setSearched(false);
      try {
        const [bookRes, annRes, semRes] = await Promise.all([
          api.get<Book[]>('/api/discovery/search', { q: query }),
          api.get<{ id: string; content: string; note?: string; type: string; bookId: string; createdAt: string }[]>('/api/annotations/search', { q: query, limit: 20 }),
          api.get<Passage[]>('/api/discovery/semantic', { q: query, topK: 10, minScore: 0.3 }).catch(() => ({ success: false, data: [] as Passage[] })),
        ]);

        if (bookRes.success && bookRes.data) {
          setResults(Array.isArray(bookRes.data) ? bookRes.data : []);
        } else {
          setResults([]);
        }

        if (annRes.success && annRes.data) {
          setHighlights((annRes.data )
            .map((a) => ({
              id: a.id,
              content: a.content || a.note || '',
              type: a.type,
              bookId: a.bookId,
              createdAt: a.createdAt,
            })));
        } else {
          setHighlights([]);
        }

        if (semRes.success && semRes.data) {
          setPassages(Array.isArray(semRes.data) ? semRes.data : []);
        } else {
          setPassages([]);
        }

        setSearched(true);
      } catch {
        setError('Search failed. Please try again.');
        setResults([]);
        setHighlights([]);
        setPassages([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results.length > 0 || highlights.length > 0 || passages.length > 0;

  const filteredResults = filter === 'highlights' || filter === 'notes' || filter === 'passages' ? [] : results;
  const filteredHighlights = filter === 'books' || filter === 'passages' ? [] : highlights.filter((h) => {
    if (filter === 'notes') return h.type === 'note';
    if (filter === 'highlights') return h.type === 'highlight';
    return true;
  });
  const filteredPassages = filter !== 'passages' && filter !== 'all' ? [] : passages;
  const filteredHasResults = filteredResults.length > 0 || filteredHighlights.length > 0 || filteredPassages.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Search</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">Find books, highlights, notes, and passages across your library</p>
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
          placeholder="Search books, highlights, notes, or passages..."
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

      {/* Filter Pills */}
      {searched && hasResults && (
        <div className="flex gap-2 mb-5">
          {([
            { key: 'all' as const, label: 'All', count: results.length + highlights.length + passages.length },
            { key: 'books' as const, label: 'Books', count: results.length },
            { key: 'passages' as const, label: 'Passages', count: passages.length },
            { key: 'highlights' as const, label: 'Highlights', count: highlights.filter((h) => h.type === 'highlight').length },
            { key: 'notes' as const, label: 'Notes', count: highlights.filter((h) => h.type === 'note').length },
          ]).filter((f) => f.key === 'all' || f.key === 'books' || f.count > 0 || (searched && f.key === 'passages')).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
              {f.count > 0 && <span className="ml-1 text-xs opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Search Results */}
      {searched ? (
        filteredHasResults ? (
          <div className="space-y-6">
            {/* Book results */}
            {filteredResults.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Books ({filteredResults.length})</h2>
                <div className="space-y-3">
                  {filteredResults.map((book) => (
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

            {/* Passage results (semantic) */}
            {filteredPassages.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Passages ({filteredPassages.length})
                </h2>
                <div className="space-y-2">
                  {filteredPassages.map((p) => (
                    <Link key={p.id} href={`/read/${p.bookId}`}
                      className="block bg-teal-50/50 dark:bg-teal-900/10 rounded-xl border border-teal-200/50 dark:border-teal-800/30 p-4 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all duration-200">
                      <div className="flex items-start gap-2">
                        <span className="text-teal-500 text-sm mt-0.5">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{p.text}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span className="font-medium text-teal-600 dark:text-teal-400">{p.bookTitle}</span>
                            {p.chapterTitle && (
                              <>
                                <span>&middot;</span>
                                <span>{p.chapterTitle}</span>
                              </>
                            )}
                            <span>&middot;</span>
                            <span>{Math.round(p.score * 100)}% match</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Highlight/Note results */}
            {filteredHighlights.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  {filter === 'notes' ? 'Notes' : filter === 'highlights' ? 'Highlights' : 'Highlights & Notes'} ({filteredHighlights.length})
                </h2>
                <div className="space-y-2">
                  {filteredHighlights.map((h) => (
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
                Find books by title or author, search highlights and notes, or discover relevant passages with AI-powered semantic search.
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
