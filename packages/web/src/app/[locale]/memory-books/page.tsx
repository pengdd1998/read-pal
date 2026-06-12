'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { analytics } from '@/lib/analytics';
import { usePageTitle } from '@/hooks/usePageTitle';
import { MemoryBooksLoadingSkeleton, ErrorBanner, EmptyState } from '@/components/memory-books/MemoryBookList';

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
  generatedAt: string;
  book?: { id: string; title: string; author: string; coverUrl?: string };
}

interface Book {
  id: string;
  title: string;
  author: string;
  progress: number;
  status: string;
}

const MemoryBookCard = React.memo(function MemoryBookCard({ mb, locale, dateLabel, chaptersLabel, momentsLabel, highlightsLabel, notesLabel, durationStr }: {
  mb: MemoryBook;
  locale: string;
  dateLabel: string;
  chaptersLabel: string;
  momentsLabel: string;
  highlightsLabel: string;
  notesLabel: string;
  durationStr: string;
}) {
  const isPersonalBook = mb.format === 'personal_book';
  return (
    <Link
      href={`/memory-books/${mb.bookId}`}
      className="block bg-surface-0 rounded-xl border border-surface-3 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isPersonalBook
            ? 'bg-gradient-to-br from-amber-200 to-amber-300 dark:from-amber-900/40 dark:to-amber-800/40'
            : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700'
        }`}>
          <span className="text-2xl">{isPersonalBook ? '📕' : '📓'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {mb.book?.title || mb.title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {isPersonalBook ? chaptersLabel : momentsLabel}
            {' · '}
            {dateLabel}
          </p>
          {mb.stats && (
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-amber-600 dark:text-amber-400">{highlightsLabel}</span>
              <span className="text-xs text-teal-600 dark:text-teal-400">{notesLabel}</span>
              {durationStr && (
                <span className="text-xs text-gray-500">{durationStr}</span>
              )}
            </div>
          )}
        </div>
        <svg aria-hidden="true" className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
});

const EligibleBookRow = React.memo(function EligibleBookRow({ book, isGenerating, onGenerate, generateLabel, generatingLabel, authorPrefix, completeLabel }: {
  book: Book;
  isGenerating: boolean;
  onGenerate: (bookId: string) => void;
  generateLabel: string;
  generatingLabel: string;
  authorPrefix: string;
  completeLabel: string;
}) {
  return (
    <div className="bg-surface-0 rounded-xl border border-surface-3 p-4 flex items-center gap-4">
      <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
        <span className="text-lg">{'📖'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm text-gray-900 truncate">{book.title}</h3>
        <p className="text-xs text-gray-500">{authorPrefix}{completeLabel}</p>
      </div>
      <button type="button"
        onClick={() => onGenerate(book.id)}
        disabled={isGenerating}
        className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {isGenerating ? generatingLabel : generateLabel}
      </button>
    </div>
  );
});

export default function MemoryBooksPage() {
  const t = useTranslations('memoryBooks');
  const tRef = useRef(t);
  tRef.current = t;
  const locale = useLocale();
  usePageTitle(t('pageTitle'));
  const [memoryBooks, setMemoryBooks] = useState<MemoryBook[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<MemoryBook[]>('/api/v1/reading-book'),
      api.get<Book[]>('/api/books'),
    ])
      .then(([mbRes, booksRes]) => {
        if (!mountedRef.current) return;
        if (mbRes.success && mbRes.data) {
          setMemoryBooks(Array.isArray(mbRes.data) ? mbRes.data : []);
        }
        if (booksRes.success && booksRes.data) {
          const list = Array.isArray(booksRes.data) ? booksRes.data : [];
          setBooks(list.filter((b) => b.progress > 10));
        }
      })
      .catch((err) => { warn('MemoryBooks: failed to load', err); if (mountedRef.current) setError(tRef.current('failedToLoad')); })
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Refetch on tab focus
  useEffect(() => {
    const onFocus = () => { if (!generating) fetchData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData, generating]);

  const handleGenerate = useCallback(async (bookId: string) => {
    setGenerating(bookId);
    try {
      const res = await api.post<MemoryBook>('/api/v1/reading-book/generate', {
        book_id: bookId,
        format: 'personal_book',
      }, { timeout: 120_000 });
      if (res.success && res.data) {
        analytics.track('reading_book_generated');
        if (!mountedRef.current) return;
        router.push(`/memory-books/${bookId}`);
      } else {
        setError(tRef.current('failedToGenerate'));
      }
    } catch (err) {
      warn('MemoryBooks: generate failed', err);
      if (!mountedRef.current) return;
      setError(tRef.current('failedToGenerate'));
    } finally {
      if (mountedRef.current) setGenerating(null);
    }
  }, [router]);

  const eligibleBooks = useMemo(() => {
    const existingBookIds = new Set(memoryBooks.map((mb) => mb.bookId));
    return books.filter((b) => !existingBookIds.has(b.id));
  }, [memoryBooks, books]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return t('durationSec', { count: seconds });
    const m = Math.floor(seconds / 60);
    if (m < 60) return t('durationMin', { count: m });
    const h = Math.floor(m / 60);
    return t('durationHm', { hours: h, mins: m % 60 });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in" aria-label={t('pageTitle')}>
      {/* Back */}
      <div className="mb-6">
        <Link href="/dashboard" prefetch={false} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('dashboard')}
        </Link>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{'📕'}</span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      {error && (
        <ErrorBanner message={error} onRetry={fetchData} retryLabel={t('tryAgain')} />
      )}

      {/* Loading */}
      {loading && <MemoryBooksLoadingSkeleton />}

      {/* Existing personal reading books */}
      {!loading && memoryBooks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('yourBooks')}</h2>
          <div className="space-y-3">
            {memoryBooks.map((mb) => (
              <MemoryBookCard
                key={mb.id}
                mb={mb}
                locale={locale}
                dateLabel={mb.generatedAt ? new Date(mb.generatedAt).toLocaleDateString(locale) : t('unknownDate')}
                chaptersLabel={t('chapters', { count: mb.sections?.length || 0 })}
                momentsLabel={t('moments', { count: mb.moments?.length || 0 })}
                highlightsLabel={t('highlights', { count: mb.stats?.totalHighlights ?? 0 })}
                notesLabel={t('notes', { count: mb.stats?.totalNotes ?? 0 })}
                durationStr={mb.stats?.readingDuration && mb.stats.readingDuration > 0 ? formatDuration(mb.stats.readingDuration) : ''}
              />
            ))}
          </div>
        </div>
      )}

      {/* Generate new */}
      {!loading && eligibleBooks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('generateNew')}</h2>
          <div className="space-y-2">
            {eligibleBooks.map((book) => (
              <EligibleBookRow
                key={book.id}
                book={book}
                isGenerating={generating === book.id}
                onGenerate={handleGenerate}
                generateLabel={t('generate')}
                generatingLabel={t('generating')}
                authorPrefix={isDisplayableAuthor(book.author) ? `${book.author} · ` : ''}
                completeLabel={t('complete', { percent: Math.round(book.progress) })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && memoryBooks.length === 0 && eligibleBooks.length === 0 && (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDesc')}
          ctaLabel={t('startReading')}
          ctaHref="/library"
        />
      )}
    </div>
  );
}
