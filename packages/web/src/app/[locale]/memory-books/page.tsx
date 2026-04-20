'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { usePageTitle } from '@/hooks/usePageTitle';

interface MemoryBookStats {
  pagesRead: number;
  totalHighlights: number;
  totalNotes: number;
  readingDuration: number;
  conceptsDiscovered: number;
  connectionsMade: number;
}

interface MemoryBookSection {
  id: string;
  title: string;
  type: string;
}

interface MemoryBook {
  id: string;
  bookId: string;
  title: string;
  format: string;
  sections: MemoryBookSection[];
  htmlContent: string | null;
  moments: Array<{ type: string; content: string }>;
  insights: Array<{ theme: string; description: string }>;
  stats: MemoryBookStats;
  createdAt: string;
  book?: { id: string; title: string; author: string; coverUrl?: string };
}

interface Book {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
}

export default function MemoryBooksPage() {
  const t = useTranslations('memoryBooks');
  usePageTitle(t('pageTitle'));
  const [memoryBooks, setMemoryBooks] = useState<MemoryBook[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<MemoryBook[]>('/api/memory-books'),
      api.get<Book[]>('/api/books'),
    ])
      .then(([mbRes, booksRes]) => {
        if (mbRes.success && mbRes.data) {
          setMemoryBooks(Array.isArray(mbRes.data) ? mbRes.data : []);
        }
        if (booksRes.success && booksRes.data) {
          const list = Array.isArray(booksRes.data) ? booksRes.data : [];
          setBooks(list.filter((b) => b.progress > 10));
        }
      })
      .catch(() => setError(t('failedToLoad')))
      .finally(() => setLoading(false));
  }, [t]);

  const handleGenerate = async (bookId: string) => {
    setGenerating(bookId);
    try {
      const res = await api.post<MemoryBook>('/api/memory-books/generate', {
        book_id: bookId,
        format: 'personal_book',
      });
      if (res.success && res.data) {
        analytics.track('reading_book_generated');
        // Navigate to the personal book page
        window.location.href = `/memory-books/${bookId}`;
      }
    } catch {
      setError(t('failedToGenerate'));
      setGenerating(null);
    }
  };

  const existingBookIds = new Set(memoryBooks.map((mb) => mb.bookId));
  const eligibleBooks = books.filter((b) => !existingBookIds.has(b.id));

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Back */}
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('dashboard')}
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{'\uD83D\uDCD5'}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-12 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-40 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing personal reading books */}
      {!loading && memoryBooks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('yourBooks')}</h2>
          <div className="space-y-3">
            {memoryBooks.map((mb) => {
              const isPersonalBook = mb.format === 'personal_book';
              const sectionCount = mb.sections?.length || 0;

              return (
                <Link
                  key={mb.id}
                  href={isPersonalBook ? `/memory-books/${mb.bookId}` : `/book/${mb.bookId}`}
                  className="block bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isPersonalBook
                        ? 'bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-900/40 dark:to-amber-800/40'
                        : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700'
                    }`}>
                      <span className="text-2xl">{isPersonalBook ? '\uD83D\uDCD5' : '\uD83D\uDCD3'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {mb.book?.title || mb.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {isPersonalBook
                          ? t('chapters', { count: sectionCount })
                          : t('moments', { count: mb.moments?.length || 0 })}
                        {' \u00B7 '}
                        {mb.createdAt ? new Date(mb.createdAt).toLocaleDateString() : t('unknownDate')}
                      </p>
                      {mb.stats && (
                        <div className="flex gap-3 mt-2">
                          <span className="text-xs text-amber-600 dark:text-amber-400">{t('highlights', { count: mb.stats.totalHighlights })}</span>
                          <span className="text-xs text-teal-600 dark:text-teal-400">{t('notes', { count: mb.stats.totalNotes })}</span>
                          {mb.stats.readingDuration && mb.stats.readingDuration > 0 && (
                            <span className="text-xs text-gray-400">{formatDuration(mb.stats.readingDuration)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Generate new */}
      {!loading && eligibleBooks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('generateNew')}</h2>
          <div className="space-y-2">
            {eligibleBooks.map((book) => (
              <div key={book.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
                <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{'\uD83D\uDCD6'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-gray-900 dark:text-white truncate">{book.title}</h3>
                  <p className="text-xs text-gray-500">{book.author} &middot; {t('complete', { percent: Math.round(book.progress) })}</p>
                </div>
                <button
                  onClick={() => handleGenerate(book.id)}
                  disabled={generating === book.id}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
                >
                  {generating === book.id ? t('generating') : t('generate')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && memoryBooks.length === 0 && eligibleBooks.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
            <span className="text-3xl">{'\uD83D\uDCD5'}</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('emptyTitle')}</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            {t('emptyDesc')}
          </p>
          <Link href="/library" className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
            {t('startReading')}
          </Link>
        </div>
      )}
    </div>
  );
}
