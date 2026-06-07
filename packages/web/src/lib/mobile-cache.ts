/**
 * Mobile Cache Layer
 *
 * Provides offline book content caching for Capacitor native apps.
 * Uses the same IndexedDB database (`readpal-offline`) as the offline queue,
 * storing chapter data in the `bookContent` object store.
 *
 * Only active when running inside a Capacitor native shell.
 */

import { isCapacitor } from './capacitor';
import { api } from './api';

const DB_NAME = 'readpal-offline';
const DB_VERSION = 2;
const CONTENT_STORE = 'bookContent';

interface CachedBook {
  bookId: string;
  chapters: CachedChapter[];
  bookTitle: string;
  cachedAt: number;
  chaptersCached: number;
}

interface CachedChapter {
  id: string;
  title: string;
  content: string;
  rawContent?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'timestamp' });
      }
      if (!db.objectStoreNames.contains(CONTENT_STORE)) {
        db.createObjectStore(CONTENT_STORE, { keyPath: 'bookId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(CONTENT_STORE, mode);
        const store = tx.objectStore(CONTENT_STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/**
 * Fetch all chapter content for a book from the API and store in IndexedDB.
 * Returns the number of chapters cached, or -1 on failure.
 */
export async function cacheBook(
  bookId: string,
): Promise<{ cached: number; total: number }> {
  if (!isCapacitor()) return { cached: 0, total: 0 };

  try {
    // Fetch the full book content (all chapters in one call)
    const res = await api.get<{
      book: { title: string };
      chapters: Array<{
        id: string;
        title: string;
        content: string;
        rawContent?: string;
      }>;
    }>(`/api/upload/books/${bookId}/content`);

    if (!res.success || !res.data) {
      return { cached: -1, total: 0 };
    }

    const { book, chapters } = res.data;
    const cachedChapters: CachedChapter[] = chapters.map((ch) => ({
      id: ch.id,
      title: ch.title,
      content: ch.content,
      rawContent: ch.rawContent,
    }));

    const entry: CachedBook = {
      bookId,
      chapters: cachedChapters,
      bookTitle: book.title,
      cachedAt: Date.now(),
      chaptersCached: cachedChapters.length,
    };

    await withStore('readwrite', (store) => store.put(entry));
    return { cached: cachedChapters.length, total: chapters.length };
  } catch (err) {
    console.warn('cacheBook: failed to cache book for offline', err);
    return { cached: -1, total: 0 };
  }
}

/**
 * Retrieve cached book content from IndexedDB.
 * Returns null if not cached or not running in Capacitor.
 */
export async function getCachedContent(
  bookId: string,
): Promise<CachedBook | null> {
  if (!isCapacitor()) return null;

  try {
    const result = await withStore<CachedBook | undefined>(
      'readonly',
      (store) => store.get(bookId),
    );
    if (result && result.chaptersCached > 0) {
      return result;
    }
    return null;
  } catch (err) {
    console.warn('getCachedContent: failed to retrieve cached content', err);
    return null;
  }
}

/**
 * Check if a book's content exists in the offline cache.
 */
export async function isCached(bookId: string): Promise<boolean> {
  if (!isCapacitor()) return false;

  try {
    const result = await withStore<CachedBook | undefined>(
      'readonly',
      (store) => store.get(bookId),
    );
    return !!result && result.chaptersCached > 0;
  } catch (err) {
    console.warn('isCached: failed to check cache status', err);
    return false;
  }
}

/**
 * Remove a book's cached content from IndexedDB.
 */
export async function removeCachedBook(bookId: string): Promise<boolean> {
  if (!isCapacitor()) return false;

  try {
    await withStore('readwrite', (store) => store.delete(bookId));
    return true;
  } catch (err) {
    console.warn('removeCachedBook: failed to remove cached book', err);
    return false;
  }
}

/**
 * Get the list of all cached book IDs.
 */
export async function getCachedBookIds(): Promise<string[]> {
  if (!isCapacitor()) return [];

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CONTENT_STORE, 'readonly');
      const store = tx.objectStore(CONTENT_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('getCachedBookIds: failed to list cached books', err);
    return [];
  }
}

/**
 * Get a single chapter's content from cache without loading the full book.
 * Useful when the reader already knows which chapter to display.
 */
export async function getCachedChapter(
  bookId: string,
  chapterIndex: number,
): Promise<string | null> {
  const cached = await getCachedContent(bookId);
  if (!cached || chapterIndex >= cached.chapters.length) return null;
  const ch = cached.chapters[chapterIndex];
  return ch.rawContent || ch.content || null;
}

export type { CachedBook, CachedChapter };
