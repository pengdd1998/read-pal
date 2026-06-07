import { isCapacitor } from '@/lib/capacitor';
import { cacheBook, isCached } from '@/lib/mobile-cache';
import { cacheBookForOffline } from '@/lib/offline-queue';
import { api } from '@/lib/api';

export function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('readpal-offline', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mutations')) db.createObjectStore('mutations', { keyPath: 'timestamp' });
      if (!db.objectStoreNames.contains('bookContent')) db.createObjectStore('bookContent', { keyPath: 'bookId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function checkOfflineCache(bookId: string): Promise<boolean> {
  try {
    if (isCapacitor()) {
      const cached = await isCached(bookId);
      return cached;
    }
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains('bookContent')) return false;
    const tx = db.transaction('bookContent', 'readonly');
    const store = tx.objectStore('bookContent');
    const result = await new Promise<any>((resolve) => {
      const req = store.get(bookId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return !!(result && result.chaptersCached > 0);
  } catch (err) {
    console.warn('checkOfflineCache: failed for book', bookId, err);
    return false;
  }
}

export async function cacheBookOffline(bookId: string): Promise<boolean> {
  try {
    if (isCapacitor()) {
      const result = await cacheBook(bookId);
      return result.cached > 0;
    }
    const res = await api.get<{ chapters: Array<{ id: string }> }>(`/api/books/${bookId}/chapters`);
    if (res.success && res.data?.chapters) {
      await cacheBookForOffline(bookId, res.data.chapters);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('cacheBookOffline: failed for book', bookId, err);
    return false;
  }
}
