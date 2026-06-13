'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { warn } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface CachedBook {
  bookId: string;
  title: string;
  author: string;
  chaptersCached: number;
  totalChapters: number;
}

interface CachedBookRowProps {
  book: CachedBook;
  chaptersCachedLabel: string;
}

const CachedBookRow = React.memo(function CachedBookRow({ book, chaptersCachedLabel }: CachedBookRowProps) {
  return (
   <Link
    key={book.bookId}
    href={`/read/${book.bookId}`}
    className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-surface-3 hover:border-amber-300 dark:hover:border-amber-700 transition-colors text-left"
   >
    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
     <svg aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
     </svg>
    </div>
    <div className="flex-1 min-w-0">
     <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
     {book.title}
     </p>
     <p className="text-xs text-gray-500 dark:text-gray-400">
     {chaptersCachedLabel}
     </p>
    </div>
   </Link>
  );
});

export default function OfflinePage() {
  const t = useTranslations('offline');
  const tRef = useRef(t);
  tRef.current = t;
  usePageTitle(t('page_title'));
  const [isOnline, setIsOnline] = useState(false);
  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCachedBooks = useCallback(async (staleRef: { current: boolean }) => {
    setError(null);
    try {
      const db = await openDB();
      const tx = db.transaction('bookContent', 'readonly');
      const store = tx.objectStore('bookContent');
      const items = await new Promise<any[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      // Enrich with book metadata from API cache
      const apiCache = await caches.open('readpal-api-v5');
      const books: CachedBook[] = [];
      for (const item of items) {
        let title = tRef.current('book_fallback', { id: item.bookId.slice(0, 8) });
        let author = '';
        try {
          const apiResp = await apiCache.match(new Request(`/api/v1/books/${item.bookId}`));
          if (apiResp?.ok) {
            const data = await apiResp.json();
            if (data?.data?.title) title = data.data.title;
            if (data?.data?.author) author = data.data.author;
          }
        } catch (err) { warn('OfflinePage: metadata not cached', err); }
        books.push({
          bookId: item.bookId,
          title,
          author,
          chaptersCached: item.chaptersCached,
          totalChapters: item.totalChapters,
        });
      }
      if (!staleRef.current) {
        setCachedBooks(books);
        setLoading(false);
      }
    } catch (err) {
      warn('OfflinePage: IndexedDB not available', err);
      if (!staleRef.current) {
        setError(tRef.current('load_error'));
        setLoading(false);
      }
    }
  }, []);

  // Load cached books on mount
  useEffect(() => {
    const staleRef = { current: false };
    loadCachedBooks(staleRef);
    return () => { staleRef.current = true; };
  }, [loadCachedBooks]);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleNetworkChange = () => {
      const nowOnline = navigator.onLine;
      setIsOnline(nowOnline);
      // Reload cached books when network state changes
      const staleRef = { current: false };
      loadCachedBooks(staleRef);
    };
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);
    return () => {
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
    };
  }, [loadCachedBooks]);

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('readpal-offline', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('mutations')) {
          db.createObjectStore('mutations', { keyPath: 'timestamp' });
        }
        if (!db.objectStoreNames.contains('bookContent')) {
          db.createObjectStore('bookContent', { keyPath: 'bookId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 px-6 py-12">
      {loading ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" aria-hidden="true" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('loading')}</p>
        </div>
      ) : (
      <>
        <div className="text-center max-w-md w-full animate-fade-in">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 flex items-center justify-between" role="alert">
              <span>{error}</span>
              <button type="button"
                onClick={() => { const staleRef = { current: false }; loadCachedBooks(staleRef); }}
                className="ml-3 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-red-400"
              >
                {t('tryAgain')}
              </button>
            </div>
          )}
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
            {isOnline ? (
              <svg aria-hidden="true" className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
              </svg>
            ) : (
              <svg aria-hidden="true" className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {isOnline ? t('online_title') : t('offline_title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {isOnline ? t('online_desc') : t('offline_desc')}
          </p>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            {isOnline ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
                </svg>
                {t('go_to_dashboard')}
              </Link>
            ) : (
              <>
                <button type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors min-h-[44px]"
                >
                  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('retry_connection')}
                </button>

                {/* Cached content access */}
                {cachedBooks.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                      {t('available_offline')}
                    </p>
                    <div className="space-y-2">
                      {cachedBooks.map((book) => (
                        <CachedBookRow
                          key={book.bookId}
                          book={book}
                          chaptersCachedLabel={t('chapters_cached', { cached: book.chaptersCached, total: book.totalChapters })}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 p-6 rounded-xl bg-surface-2 border border-surface-3 animate-fade-in">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <svg aria-hidden="true" className="w-7 h-7 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      {t('no_offline_books_title')}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {t('no_offline_books_desc')}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tips */}
          {!isOnline && (
            <div className="mt-8 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 text-left">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">{t('offline_tips_title')}</p>
              <ul className="text-xs text-amber-600/80 dark:text-amber-400/80 space-y-1">
                <li>- {t('tip_highlights')}</li>
                <li>- {t('tip_offline_books')}</li>
                <li>- {t('tip_streak')}</li>
              </ul>
            </div>
          )}
        </div>
      </>
      )}
    </div>
  );
}
