'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { getQueueCount, clearQueue, cacheBookForOffline } from '@/lib/offline-queue';

interface CachedBook {
  bookId: string;
  title?: string;
  cachedAt?: number;
}

export function OfflineSection() {
  const { toast } = useToast();
  const [queueCount, setQueueCount] = useState(0);
  const [cachedBooks, setCachedBooks] = useState<CachedBook[]>([]);
  const [books, setBooks] = useState<Array<{ id: string; title: string; author: string }>>([]);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [caching, setCaching] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const count = await getQueueCount();
        setQueueCount(count);

        const dbReq = indexedDB.open('readpal-offline', 2);
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          if (db.objectStoreNames.contains('bookContent')) {
            const tx = db.transaction('bookContent', 'readonly');
            const store = tx.objectStore('bookContent');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              setCachedBooks(getAllReq.result || []);
            };
          }
        };

        const res = await api.get<{ books: Array<{ id: string; title: string; author: string }> }>('/api/books?status=reading&pageSize=50');
        if (res.data?.books) setBooks(res.data.books);
      } catch {
        // Offline or not configured
      }
    }
    load();
  }, []);

  async function handleCacheSelected() {
    if (selectedBooks.size === 0) return;
    setCaching(true);
    try {
      const booksToCache = books.filter((b) => selectedBooks.has(b.id));
      for (const book of booksToCache) {
        await cacheBookForOffline(book.id, [{ id: '1' }]);
      }
      toast(`${booksToCache.length} book${booksToCache.length > 1 ? 's' : ''} cached for offline`, 'success');
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
      toast('Failed to cache books', 'error');
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
          toast('Removed from offline cache', 'success');
        };
      };
    } catch {
      toast('Failed to remove', 'error');
    }
  }

  async function handleClearQueue() {
    try {
      await clearQueue();
      setQueueCount(0);
      toast('Pending sync queue cleared', 'success');
    } catch {
      toast('Failed to clear queue', 'error');
    }
  }

  const cachedIds = new Set(cachedBooks.map((b) => b.bookId));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
      <div className="space-y-5">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sync Status</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {queueCount > 0
                ? `${queueCount} change${queueCount !== 1 ? 's' : ''} pending sync`
                : 'All changes synced'}
            </p>
          </div>
          {queueCount > 0 && (
            <button
              onClick={handleClearQueue}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Clear Queue
            </button>
          )}
        </div>

        {/* Cached books */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Cached Books</h3>
          {cachedBooks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No books cached for offline reading yet.</p>
          ) : (
            <div className="space-y-2">
              {cachedBooks.map((cb) => (
                <div key={cb.bookId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{cb.title || cb.bookId}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveCached(cb.bookId)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cache more books */}
        {books.length > 0 && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Cache for Offline</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select books to make available without internet.</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {books
                .filter((b) => !cachedIds.has(b.id))
                .map((book) => (
                  <label key={book.id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedBooks.has(book.id)}
                      onChange={(e) => {
                        const next = new Set(selectedBooks);
                        if (e.target.checked) next.add(book.id);
                        else next.delete(book.id);
                        setSelectedBooks(next);
                      }}
                      className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{book.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">{book.author}</span>
                  </label>
                ))}
              {books.filter((b) => !cachedIds.has(b.id)).length === 0 && (
                <p className="text-xs text-gray-400">All current books are already cached.</p>
              )}
            </div>
            {selectedBooks.size > 0 && (
              <button
                onClick={handleCacheSelected}
                disabled={caching}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 transition-colors"
              >
                {caching ? 'Caching...' : `Cache ${selectedBooks.size} Book${selectedBooks.size > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
