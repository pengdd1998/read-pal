import { isCapacitor } from '@/lib/capacitor';
import { cacheBook, isCached } from '@/lib/mobile-cache';
import { cacheBookForOffline, openOfflineDB } from '@/lib/offline-queue';
import { api } from '@/lib/api';
import { warn } from './logger';

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
    const result = await new Promise<{ chaptersCached: number } | null>((resolve) => {
      const req = store.get(bookId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    return !!(result && result.chaptersCached > 0);
  } catch (err) {
    warn('checkOfflineCache: failed for book', bookId, err);
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
    warn('cacheBookOffline: failed for book', bookId, err);
    return false;
  }
}
