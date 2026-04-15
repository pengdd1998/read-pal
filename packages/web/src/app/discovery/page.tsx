'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FreeBook {
  id: string;
  title: string;
  author: string;
  language?: string;
  pages: number;
}

interface Recommendation {
  id: string;
  title: string;
  author: string;
  progress?: number;
  status?: string;
  totalPages?: number;
  lastReadAt?: string;
}

interface RecommendationData {
  topAuthors: string[];
  authorRecommendations: Recommendation[];
  unreadRecommendations: Recommendation[];
  stalledRecommendations: Recommendation[];
  freeBookSuggestions: { id: string; title: string; author: string; pages: number }[];
  stats: { booksCompleted: number; booksReading: number; booksUnread: number };
}

export default function DiscoveryPage() {
  const [tab, setTab] = useState<'recommendations' | 'freebooks'>('recommendations');
  const [recs, setRecs] = useState<RecommendationData | null>(null);
  const [freeBooks, setFreeBooks] = useState<FreeBook[]>([]);
  const [freeBooksSearch, setFreeBooksSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<RecommendationData>('/api/discovery/recommendations'),
      api.get<{ data: FreeBook[] }>('/api/discovery/free-books'),
    ])
      .then(([recsRes, fbRes]) => {
        if (cancelled) return;
        if (recsRes.success && recsRes.data) {
          setRecs(recsRes.data);
        }
        if (fbRes.success && fbRes.data) {
          const data = fbRes.data as unknown;
          setFreeBooks(Array.isArray(data) ? data : (data as { data: FreeBook[] }).data || []);
        }
      })
      .catch(() => { if (!cancelled) setError('Failed to load discovery data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleImport = async (book: FreeBook) => {
    setImporting(book.id);
    try {
      const res = await api.post('/api/books', {
        title: book.title,
        author: book.author,
        sourceId: book.id,
        totalPages: book.pages,
      });
      if (res.success) {
        setImportedIds((prev) => new Set(prev).add(book.id));
      }
    } catch {
      setError('Failed to import book');
    } finally {
      setImporting(null);
    }
  };

  const filteredFreeBooks = freeBooksSearch
    ? freeBooks.filter((b) =>
        b.title.toLowerCase().includes(freeBooksSearch.toLowerCase()) ||
        b.author.toLowerCase().includes(freeBooksSearch.toLowerCase()),
      )
    : freeBooks;

  const allRecs = recs
    ? [
        ...recs.stalledRecommendations.map((r) => ({ ...r, reason: 'Continue reading' as const })),
        ...recs.unreadRecommendations.map((r) => ({ ...r, reason: 'Not started yet' as const })),
        ...recs.authorRecommendations.map((r) => ({ ...r, reason: `More from ${recs.topAuthors.join(', ')}` as const })),
      ]
    : [];

  return (
    <main className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Discover</h1>
        <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mt-1">
          Personalized recommendations and free classic books
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 animate-slide-up stagger-1">
        {(['recommendations', 'freebooks'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-amber-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-amber-100 dark:hover:bg-gray-700'
            }`}
          >
            {t === 'recommendations' ? 'For You' : 'Free Classics'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-14 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-48 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : tab === 'recommendations' ? (
        /* Recommendations Tab */
        <div className="space-y-8">
          {/* Stats */}
          {recs && (
            <div className="grid grid-cols-3 gap-3 animate-slide-up stagger-2">
              <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{recs.stats.booksCompleted}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{recs.stats.booksReading}</div>
                <div className="text-xs text-gray-500">Reading</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-gray-600 dark:text-gray-400">{recs.stats.booksUnread}</div>
                <div className="text-xs text-gray-500">Unread</div>
              </div>
            </div>
          )}

          {/* Stalled books */}
          {recs?.stalledRecommendations && recs.stalledRecommendations.length > 0 && (
            <div className="animate-slide-up stagger-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Continue Reading</h2>
              <div className="space-y-2">
                {recs.stalledRecommendations.map((book, i) => (
                  <Link key={book.id} href={`/read/${book.id}`}
                    className={`stagger-${Math.min(i + 1, 6)} animate-slide-up block bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200/50 dark:border-amber-800/30 p-4 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all duration-200`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{'\uD83D\uDCD6'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{book.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>
                        {book.progress != null && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div className="bg-amber-400 rounded-full h-1.5" style={{ width: `${Math.round(book.progress)}%` }} />
                            </div>
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{Math.round(book.progress)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Unread books */}
          {recs?.unreadRecommendations && recs.unreadRecommendations.length > 0 && (
            <div className="animate-slide-up stagger-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Start Something New</h2>
              <div className="space-y-2">
                {recs.unreadRecommendations.map((book, i) => (
                  <Link key={book.id} href={`/read/${book.id}`}
                    className={`stagger-${Math.min(i + 1, 6)} animate-slide-up block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-teal-400/30 to-teal-600/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{'\uD83D\uDCD5'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{book.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Author recommendations */}
          {recs?.authorRecommendations && recs.authorRecommendations.length > 0 && recs.topAuthors.length > 0 && (
            <div className="animate-slide-up stagger-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                More from {recs.topAuthors.slice(0, 2).join(', ')}
              </h2>
              <div className="space-y-2">
                {recs.authorRecommendations.map((book, i) => (
                  <Link key={book.id} href={`/read/${book.id}`}
                    className={`stagger-${Math.min(i + 1, 6)} animate-slide-up block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-violet-400/30 to-violet-600/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">{'\uD83D\uDCD3'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{book.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{book.author}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Free book suggestions from recommendations API */}
          {recs?.freeBookSuggestions && recs.freeBookSuggestions.length > 0 && (
            <div className="animate-slide-up stagger-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Free Classics You Might Like</h2>
              <div className="space-y-2">
                {recs.freeBookSuggestions.map((fb, i) => (
                  <div key={fb.id} className={`stagger-${Math.min(i + 1, 6)} animate-slide-up bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3`}>
                    <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-emerald-400/30 to-emerald-600/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{'\uD83C\uDF1F'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{fb.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{fb.author} &middot; {fb.pages} pages</p>
                    </div>
                    <button
                      onClick={() => handleImport(fb)}
                      disabled={importing === fb.id || importedIds.has(fb.id)}
                      className="px-4 py-2.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
                    >
                      {importedIds.has(fb.id) ? 'Added' : importing === fb.id ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty recommendations */}
          {recs && allRecs.length === 0 && recs.freeBookSuggestions.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
                <span className="text-3xl">{'\uD83C\uDF0D'}</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Discover your next favorite book
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto leading-relaxed">
                As you read more, we&apos;ll recommend books based on your favorite authors, genres, and reading patterns.
              </p>
              <Link
                href="/library"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Add a book to get started
              </Link>
            </div>
          )}
        </div>
      ) : (
        /* Free Classics Tab */
        <div>
          {/* Search */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={freeBooksSearch}
              onChange={(e) => setFreeBooksSearch(e.target.value)}
              placeholder="Search free classics..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400 transition-all"
            />
          </div>

          {/* Books grid */}
          <div className="space-y-2">
            {filteredFreeBooks.map((book, i) => (
              <div key={book.id} className={`stagger-${Math.min(i + 1, 6)} animate-slide-up bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow`}>
                <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-emerald-400/30 to-teal-600/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{'\uD83D\uDCD6'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{book.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{book.author} &middot; {book.pages} pages</p>
                </div>
                <button
                  onClick={() => handleImport(book)}
                  disabled={importing === book.id || importedIds.has(book.id)}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {importedIds.has(book.id) ? 'Added' : importing === book.id ? 'Adding...' : 'Add to Library'}
                </button>
              </div>
            ))}
          </div>

          {filteredFreeBooks.length === 0 && freeBooksSearch && (
            <div className="text-center py-12">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-1">
                No classics match &quot;{freeBooksSearch}&quot;
              </p>
              <button
                onClick={() => setFreeBooksSearch('')}
                className="text-sm text-amber-600 dark:text-amber-400 hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-gray-700 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
