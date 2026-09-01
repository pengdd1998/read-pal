'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { useToast } from '@/components/Toast';
import { getQueueCount, clearQueue, cacheBookForOffline, openOfflineDB } from '@/lib/offline-queue';
import { warn } from '@/lib/logger';

interface CachedBook {
  bookId: string;
  title?: string;
  cachedAt?: number;
}

const STORE_NAME = 'bookContent';

/** Open IndexedDB and resolve with the cached books (or empty list on failure). */
async function fetchCachedBooks(): Promise<CachedBook[]> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_NAME)) return [];
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getAllReq = tx.objectStore(STORE_NAME).getAll();
      getAllReq.onsuccess = () => resolve(getAllReq.result || []);
      getAllReq.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

const CachedBookRow = React.memo(function CachedBookRow({ cb, onRemove, removeLabel }: {
  cb: CachedBook;
  onRemove: (bookId: string) => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="text-sm text-gray-700 dark:text-gray-300">{cb.title || cb.bookId}</span>
      </div>
      <button type="button"
        onClick={() => onRemove(cb.bookId)}
        className="min-h-[44px] px-3 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
        {removeLabel}
      </button>
    </div>
  );
});

const BookCheckboxRow = React.memo(function BookCheckboxRow({ book, isSelected, onToggle }: {
  book: { id: string; title: string; author: string };
  isSelected: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 py-1.5 min-h-[44px] cursor-pointer">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onToggle(book.id, e.target.checked)}
        className="rounded border-surface-3 text-teal-600 focus:ring-teal-500"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{book.title}</span>
      {isDisplayableAuthor(book.author) && <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{book.author}</span>}
    </label>
  );
});

export const OfflineSection = React.memo(function OfflineSection() {
  const { toast } = useToast();
  const t = useTranslations('settings_page');
  const tRef = useRef(t); tRef.current = t;
  const [queueCount, setQueueCount] = useState(0);
  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);
  const [books, setBooks] = useState<Array<{ id: string; title: string; author: string }>>([]);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [caching, setCaching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const loadOfflineData = useCallback(() => {
    let stale = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const count = await getQueueCount();
        if (stale) return;
        setQueueCount(count);

        const cached = await fetchCachedBooks();
        if (stale) return;
        setCachedBooks(cached);

        const res = await api.get<{ books: Array<{ id: string; title: string; author: string }> }>('/api/books?status=reading&pageSize=50');
        if (stale) return;
        if (res.data?.books) setBooks(res.data.books);
      } catch (err) {
        if (stale) return;
        warn('OfflineSection: failed to load offline data', err);
        setLoadError(true);
        toast(tRef.current('offline_load_failed'), 'error');
      } finally {
        if (!stale) setLoading(false);
      }
    })();
    return () => { stale = true; };
  }, [toast]);

  useEffect(() => { return loadOfflineData(); }, [loadOfflineData]);

  async function handleCacheSelected() {
    if (selectedBooks.size === 0) return;
    setCaching(true);
    try {
      const booksToCache = books.filter((b) => selectedBooks.has(b.id));
      for (const book of booksToCache) {
        await cacheBookForOffline(book.id, [{ id: '1' }]);
      }
      if (!mountedRef.current) return;
      toast(t('offline_cache_success', { count: booksToCache.length }), 'success');
      setSelectedBooks(new Set());
      const cached = await fetchCachedBooks();
      if (!mountedRef.current) return;
      setCachedBooks(cached);
    } catch (e) {
      warn('OfflineSection: failed to cache books for offline', e);
      if (!mountedRef.current) return;
      toast(t('offline_cache_failed'), 'error');
    } finally {
      if (mountedRef.current) setCaching(false);
    }
  }

  async function handleRemoveCached(bookId: string) {
    try {
      const success = await (async () => {
        try {
          const db = await openOfflineDB();
          if (!db.objectStoreNames.contains(STORE_NAME)) return false;
          return await new Promise<boolean>((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(bookId);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          });
        } catch {
          return false;
        }
      })();
      if (!mountedRef.current) return;
      if (success) {
        setCachedBooks((prev) => prev.filter((b) => b.bookId !== bookId));
        toast(t('offline_remove_success'), 'success');
      } else {
        toast(t('offline_remove_failed'), 'error');
      }
    } catch (e) {
      warn('OfflineSection: failed to remove cached book', e);
      if (!mountedRef.current) return;
      toast(t('offline_remove_failed'), 'error');
    }
  }

  async function handleClearQueue() {
    try {
      await clearQueue();
      if (!mountedRef.current) return;
      setQueueCount(0);
      toast(t('offline_queue_cleared'), 'success');
    } catch (e) {
      warn('OfflineSection: failed to clear offline queue', e);
      if (!mountedRef.current) return;
      toast(t('offline_clear_failed'), 'error');
    }
  }

  function handleBookToggle(id: string, checked: boolean) {
    const next = new Set(selectedBooks);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedBooks(next);
  }

  const cachedIds = new Set(cachedBooks.map((b) => b.bookId));

  return (
    <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6">
      <div className="space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('offline_sync_status')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {queueCount > 0
                ? t('offline_queue_pending', { count: queueCount })
                : t('offline_all_synced')}
            </p>
          </div>
          {queueCount > 0 && (
            <button type="button"
              onClick={handleClearQueue}
              className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-surface-1 hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
            >
              {t('offline_clear_queue')}
            </button>
          )}
        </div>

        {/* Cached books */}
        <div className="pt-4 border-t border-surface-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('offline_cached_books')}</h3>
          {cachedBooks.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('offline_no_cached')}</p>
          ) : (
            <div className="space-y-2">
              {cachedBooks.map((cb) => (
                <CachedBookRow
                  key={cb.bookId}
                  cb={cb}
                  onRemove={handleRemoveCached}
                  removeLabel={t('offline_remove')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Cache more books */}
        {loading ? (
          <div className="pt-4 border-t border-surface-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('offline_cache_heading')}</h3>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2 py-1.5">
                  <div className="w-4 h-4 rounded skeleton animate-pulse" />
                  <div className="flex-1 h-4 rounded skeleton animate-pulse" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('offline_loading')}</p>
          </div>
        ) : loadError ? (
          <div className="pt-4 border-t border-surface-2">
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{t('offline_load_failed')}</p>
            <button type="button" onClick={loadOfflineData} className="min-h-[44px] px-3 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">{t('retry')}</button>
          </div>
        ) : books.length > 0 && (
          <div className="pt-4 border-t border-surface-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('offline_cache_heading')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('offline_cache_desc')}</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {books
                .filter((b) => !cachedIds.has(b.id))
                .map((book) => (
                  <BookCheckboxRow
                    key={book.id}
                    book={book}
                    isSelected={selectedBooks.has(book.id)}
                    onToggle={handleBookToggle}
                  />
                ))}
              {books.filter((b) => !cachedIds.has(b.id)).length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('offline_all_cached')}</p>
              )}
            </div>
            {selectedBooks.size > 0 && (
              <button type="button"
                onClick={handleCacheSelected}
                disabled={caching}
                className="mt-3 min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              >
                {caching ? t('offline_caching') : t('offline_cache_button', { count: selectedBooks.size })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
