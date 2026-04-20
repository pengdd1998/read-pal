'use client';

import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTranslations } from 'next-intl';

interface CachedBook {
  bookId: string;
  title: string;
  author: string;
  chaptersCached: number;
  totalChapters: number;
}

export default function OfflinePage() {
  const t = useTranslations('offline');
  usePageTitle(t('page_title'));
  const [isOnline, setIsOnline] = useState(false);
  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Try to load cached books from IndexedDB
  useEffect(() => {
    async function loadCachedBooks() {
      try {
        const db = await openDB();
        const tx = db.transaction('bookContent', 'readonly');
        const store = tx.objectStore('bookContent');
        const items = await new Promise<any[]>((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        // Enrich with book metadata from cache
        const cache = await caches.open('readpal-content-v2');
        const books: CachedBook[] = [];
        for (const item of items) {
          books.push({
            bookId: item.bookId,
            title: `Book ${item.bookId.slice(0, 8)}`,
            author: '',
            chaptersCached: item.chaptersCached,
            totalChapters: item.totalChapters,
          });
        }
        setCachedBooks(books);
      } catch {
        // IndexedDB not available
      }
    }
    loadCachedBooks();
  }, []);

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
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-6 py-12">
      <div className="text-center max-w-md w-full animate-fade-in">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
          {isOnline ? (
            <svg className="w-10 h-10 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {isOnline ? t('online_title') : t('offline_title')}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          {isOnline ? t('online_desc') : t('offline_desc')}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {isOnline ? (
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
              </svg>
              {t('go_to_dashboard')}
            </a>
          ) : (
            <>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('retry_connection')}
              </button>

              {/* Cached content access */}
              {cachedBooks.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    {t('available_offline')}
                  </p>
                  <div className="space-y-2">
                    {cachedBooks.map((book) => (
                      <a
                        key={book.bookId}
                        href={`/read/${book.bookId}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-amber-300 dark:hover:border-amber-700 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {book.title}
                          </p>
                          <p className="text-xs text-gray-400">
                            {t('chapters_cached', { cached: book.chaptersCached, total: book.totalChapters })}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
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
              <li>• {t('tip_highlights')}</li>
              <li>• {t('tip_offline_books')}</li>
              <li>• {t('tip_streak')}</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
