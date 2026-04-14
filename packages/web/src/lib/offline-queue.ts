/**
 * Offline Mutation Queue
 *
 * Provides a client-side queue for API mutations that should be
 * retried when the user comes back online. Used by the API client
 * and components to gracefully handle offline state.
 */

interface QueuedMutation {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
  description?: string;
}

const DB_NAME = 'readpal-offline';
const DB_VERSION = 2;
const STORE_NAME = 'mutations';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
      }
      if (!db.objectStoreNames.contains('bookContent')) {
        db.createObjectStore('bookContent', { keyPath: 'bookId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Queue a mutation for later retry.
 * Returns true if queued successfully.
 */
export async function queueMutation(
  url: string,
  method: string,
  body: unknown,
  headers?: Record<string, string>,
  description?: string,
): Promise<boolean> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const item: QueuedMutation = {
      url,
      method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: headers || {},
      timestamp: Date.now(),
      description,
    };

    await new Promise<void>((resolve, reject) => {
      const req = store.add(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Dispatch event so NetworkStatus can update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mutation-queued'));
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the count of queued mutations.
 */
export async function getQueueCount(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Clear all queued mutations.
 */
export async function clearQueue(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // Ignore errors
  }
}

/**
 * Request the service worker to cache a book's content for offline reading.
 */
export async function cacheBookForOffline(bookId: string, chapters: Array<{ id: string }>): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'CACHE_BOOK',
    bookId,
    chapters,
  });
}
