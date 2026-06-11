'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { isDisplayableAuthor } from '@/lib/book-cover';
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

export default function MemoryBooksPage() {
 const t = useTranslations('memoryBooks');
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
   .catch((err) => { console.warn('MemoryBooks: failed to load', err); if (mountedRef.current) setError(t('failedToLoad')); })
   .finally(() => { if (mountedRef.current) setLoading(false); });
 }, [t]);

 useEffect(() => { fetchData(); }, [fetchData]);

 // Refetch on tab focus
 useEffect(() => {
  const onFocus = () => { if (!generating) fetchData(); };
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
 }, [fetchData, generating]);

 const handleGenerate = async (bookId: string) => {
 setGenerating(bookId);
 try {
  const res = await api.post<MemoryBook>('/api/v1/reading-book/generate', {
  book_id: bookId,
  format: 'personal_book',
  });
  if (res.success && res.data) {
  analytics.track('reading_book_generated');
  if (!mountedRef.current) return;
  // Navigate to the personal book page
  router.push(`/memory-books/${bookId}`);
  } else {
   setError(t('failedToGenerate'));
  }
 } catch (err) {
  console.warn('MemoryBooks: generate failed', err);
  if (!mountedRef.current) return;
  setError(t('failedToGenerate'));
 } finally {
  if (mountedRef.current) setGenerating(null);
 }
 };
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
 <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in" id="main-content" aria-label={t('pageTitle')}>
  {/* Back */}
  <div className="mb-6">
  <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
   <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
   <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('subtitle')}</p>
   </div>
  </div>
  </div>

  {error && (
  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between" role="alert">
   <span>{error}</span>
   <button type="button"
    onClick={fetchData}
    className="ml-4 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[44px]"
   >
    {t('tryAgain')}
   </button>
  </div>
  )}

  {/* Loading */}
  {loading && (
  <div className="space-y-4" role="status" aria-busy="true">
   {Array.from({ length: 3 }).map((_, i) => (
   <div key={i} className="bg-surface-0 rounded-xl border border-surface-3 p-5 animate-pulse">
    <div className="flex items-center gap-3">
    <div className="w-12 h-16 bg-surface-1 rounded-lg" />
    <div className="flex-1">
     <div className="h-4 bg-surface-1 rounded w-40 mb-2" />
     <div className="h-3 bg-surface-1 rounded w-24" />
    </div>
    </div>
   </div>
   ))}
  </div>
  )}

  {/* Existing personal reading books */}
  {!loading && memoryBooks.length > 0 && (
  <div className="mb-8">
   <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t('yourBooks')}</h2>
   <div className="space-y-3">
   {memoryBooks.map((mb) => {
    const isPersonalBook = mb.format === 'personal_book';
    const sectionCount = mb.sections?.length || 0;

    return (
    <Link
     key={mb.id}
     href={`/memory-books/${mb.bookId}`}
     className="block bg-surface-0 rounded-xl border border-surface-3 p-4 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
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
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
      {mb.book?.title || mb.title}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
      {isPersonalBook
       ? t('chapters', { count: sectionCount })
       : t('moments', { count: mb.moments?.length || 0 })}
      {' \u00B7 '}
      {mb.generatedAt ? new Date(mb.generatedAt).toLocaleDateString(locale) : t('unknownDate')}
      </p>
      {mb.stats && (
      <div className="flex gap-3 mt-2">
       <span className="text-xs text-amber-600 dark:text-amber-400">{t('highlights', { count: mb.stats.totalHighlights })}</span>
       <span className="text-xs text-teal-600 dark:text-teal-400">{t('notes', { count: mb.stats.totalNotes })}</span>
       {mb.stats.readingDuration && mb.stats.readingDuration > 0 && (
       <span className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(mb.stats.readingDuration)}</span>
       )}
      </div>
      )}
     </div>
     <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
   <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{t('generateNew')}</h2>
   <div className="space-y-2">
   {eligibleBooks.map((book) => (
    <div key={book.id} className="bg-surface-0 rounded-xl border border-surface-3 p-4 flex items-center gap-4">
    <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-400/30 to-amber-600/50 flex items-center justify-center flex-shrink-0">
     <span className="text-lg">{'\uD83D\uDCD6'}</span>
    </div>
    <div className="flex-1 min-w-0">
     <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{book.title}</h3>
     <p className="text-xs text-gray-500 dark:text-gray-400">{isDisplayableAuthor(book.author) ? `${book.author} · ` : ''}{t('complete', { percent: Math.round(book.progress) })}</p>
    </div>
    <button type="button"
     onClick={() => handleGenerate(book.id)}
     disabled={generating === book.id}
     className="px-4 py-2 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
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
   <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('emptyTitle')}</h2>
   <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
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
