'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { useToast } from '@/components/Toast';
import { getQueueCount, clearQueue, cacheBookForOffline } from '@/lib/offline-queue';

interface CachedBook {
 bookId: string;
 title?: string;
 cachedAt?: number;
}

export function OfflineSection() {
 const { toast } = useToast();
 const t = useTranslations('settings_page');
 const [queueCount, setQueueCount] = useState(0);
 const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);
 const [books, setBooks] = useState<Array<{ id: string; title: string; author: string }>>([]);
 const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
 const [caching, setCaching] = useState(false);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState(false);

 useEffect(() => {
 let stale = false;
 async function load() {
  setLoading(true);
   setLoadError(false);
  try {
  const count = await getQueueCount();
  if (stale) return;
  setQueueCount(count);

  const dbReq = indexedDB.open('readpal-offline', 2);
  dbReq.onsuccess = () => {
   if (stale) return;
   const db = dbReq.result;
   if (db.objectStoreNames.contains('bookContent')) {
   const tx = db.transaction('bookContent', 'readonly');
   const store = tx.objectStore('bookContent');
   const getAllReq = store.getAll();
   getAllReq.onsuccess = () => {
    if (stale) return;
    setCachedBooks(getAllReq.result || []);
   };
   }
  };

  const res = await api.get<{ books: Array<{ id: string; title: string; author: string }> }>('/api/books?status=reading&pageSize=50');
  if (stale) return;
  if (res.data?.books) setBooks(res.data.books);
  } catch (err) {
  if (stale) return;
  console.warn('OfflineSection: failed to load offline data', err);
  } finally {
  if (!stale) setLoading(false);
  }
 }
 load();
 return () => { stale = true; };
 }, []);

 async function handleCacheSelected() {
 if (selectedBooks.size === 0) return;
 setCaching(true);
 try {
  const booksToCache = books.filter((b) => selectedBooks.has(b.id));
  for (const book of booksToCache) {
  await cacheBookForOffline(book.id, [{ id: '1' }]);
  }
  toast(t('offline_cache_success', { count: booksToCache.length }), 'success');
  setSelectedBooks(new Set());
  const dbReq = indexedDB.open('readpal-offline', 2);
  dbReq.onsuccess = () => {
  const db = dbReq.result;
  if (db.objectStoreNames.contains('bookContent')) {
   const tx = db.transaction('bookContent', 'readonly');
   const store = tx.objectStore('bookContent');
   const getAllReq = store.getAll();
   getAllReq.onsuccess = () => setCachedBooks(getAllReq.result || []);
  }
  };
 } catch {
  toast(t('offline_cache_failed'), 'error');
 } finally {
  setCaching(false);
 }
 }

 async function handleRemoveCached(bookId: string) {
 try {
  const dbReq = indexedDB.open('readpal-offline', 2);
  dbReq.onsuccess = () => {
  const db = dbReq.result;
  const tx = db.transaction('bookContent', 'readwrite');
  tx.objectStore('bookContent').delete(bookId);
  tx.oncomplete = () => {
   setCachedBooks((prev) => prev.filter((b) => b.bookId !== bookId));
   toast(t('offline_remove_success'), 'success');
  };
  };
 } catch {
  toast(t('offline_remove_failed'), 'error');
 }
 }

 async function handleClearQueue() {
 try {
  await clearQueue();
  setQueueCount(0);
  toast(t('offline_queue_cleared'), 'success');
 } catch {
  toast(t('offline_clear_failed'), 'error');
 }
 }

 const cachedIds = new Set(cachedBooks.map((b) => b.bookId));

 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6">
  <div className="space-y-5">
  {/* Status */}
  <div className="flex items-center justify-between">
   <div>
   <h3 className="text-sm font-semibold text-gray-900">{t('offline_sync_status')}</h3>
   <p className="text-xs text-gray-500 mt-0.5">
    {queueCount > 0
    ? t('offline_queue_pending', { count: queueCount })
    : t('offline_all_synced')}
   </p>
   </div>
   {queueCount > 0 && (
   <button
    onClick={handleClearQueue}
    className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
   >
    {t('offline_clear_queue')}
   </button>
   )}
  </div>

  {/* Cached books */}
  <div className="pt-4 border-t border-surface-2">
   <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('offline_cached_books')}</h3>
   {cachedBooks.length === 0 ? (
   <p className="text-xs text-gray-400">{t('offline_no_cached')}</p>
   ) : (
   <div className="space-y-2">
    {cachedBooks.map((cb) => (
    <div key={cb.bookId} className="flex items-center justify-between py-1.5">
     <div className="flex items-center gap-2">
     <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
     <span className="text-sm text-gray-700">{cb.title || cb.bookId}</span>
     </div>
     <button
     onClick={() => handleRemoveCached(cb.bookId)}
     className="min-h-[44px] px-3 py-1 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
     >
     {t('offline_remove')}
     </button>
    </div>
    ))}
   </div>
   )}
  </div>

  {/* Cache more books */}
  {loading ? (
   <div className="pt-4 border-t border-surface-2">
   <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('offline_cache_heading')}</h3>
   <div className="space-y-2">
    {[1, 2, 3].map((i) => (
    <div key={i} className="flex items-center gap-2 py-1.5">
     <div className="w-4 h-4 rounded bg-gray-200 animate-pulse" />
     <div className="flex-1 h-4 rounded bg-gray-200 animate-pulse" />
    </div>
    ))}
   </div>
   <p className="text-xs text-gray-400 mt-2">{t('offline_loading')}</p>
   </div>
  ) : loadError ? (
   <div className="pt-4 border-t border-surface-2">
   <p className="text-xs text-red-500">{t('offline_load_failed')}</p>
   </div>
  ) : books.length > 0 && (
   <div className="pt-4 border-t border-surface-2">
   <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('offline_cache_heading')}</h3>
   <p className="text-xs text-gray-500 mb-3">{t('offline_cache_desc')}</p>
   <div className="space-y-1.5 max-h-48 overflow-y-auto">
    {books
    .filter((b) => !cachedIds.has(b.id))
    .map((book) => (
     <label key={book.id} className="flex items-center gap-2 py-1.5 min-h-[44px] cursor-pointer">
     <input
      type="checkbox"
      checked={selectedBooks.has(book.id)}
      onChange={(e) => {
      const next = new Set(selectedBooks);
      if (e.target.checked) next.add(book.id);
      else next.delete(book.id);
      setSelectedBooks(next);
      }}
      className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
     />
     <span className="text-sm text-gray-700 truncate">{book.title}</span>
     {isDisplayableAuthor(book.author) && <span className="text-xs text-gray-400 ml-auto">{book.author}</span>}
     </label>
    ))}
    {books.filter((b) => !cachedIds.has(b.id)).length === 0 && (
    <p className="text-xs text-gray-400">{t('offline_all_cached')}</p>
    )}
   </div>
   {selectedBooks.size > 0 && (
    <button
    onClick={handleCacheSelected}
    disabled={caching}
    className="mt-3 min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
    {caching ? t('offline_caching') : t('offline_cache_button', { count: selectedBooks.size })}
    </button>
   )}
   </div>
  )}
  </div>
 </div>
 );
}
