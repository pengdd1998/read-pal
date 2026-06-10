/**
 * Offline Mutation Queue
 *
 * Persists API mutations to IndexedDB so they survive page refreshes.
 * When the user comes back online, queued mutations are replayed.
 *
 * Each entry stores an action descriptor ({ url, method, body, headers })
 * rather than a function reference, making it serializable.
 */

interface QueuedMutation {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  timestamp: number;
  retryCount: number;
  description?: string;
}

const DB_NAME = 'readpal-offline';
const DB_VERSION = 3;
const STORE_NAME = 'mutations';
const MAX_RETRIES = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
        store.createIndex('retryCount', 'retryCount', { unique: false });
      } else {
        // v2→v3: add retryCount if missing
        const store = req.transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains('retryCount')) {
          store.createIndex('retryCount', 'retryCount', { unique: false });
        }
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
 * Queue a mutation for later retry. Returns true if queued successfully.
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
      retryCount: 0,
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
 * Get all queued mutations (sorted oldest first).
 */
async function getAllQueued(): Promise<QueuedMutation[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as QueuedMutation[])
          .filter((item) => Date.now() - item.timestamp < MAX_AGE_MS);
        items.sort((a, b) => a.timestamp - b.timestamp);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Remove a mutation from the queue by timestamp.
 */
async function removeQueued(timestamp: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(timestamp);
  } catch {
    // Ignore
  }
}

/**
 * Update a mutation's retry count in place.
 */
async function incrementRetry(timestamp: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(timestamp);
    req.onsuccess = () => {
      const item = req.result as QueuedMutation | undefined;
      if (item) {
        item.retryCount = (item.retryCount || 0) + 1;
        store.put(item);
      }
    };
  } catch {
    // Ignore
  }
}

/**
 * Replay all queued mutations. Returns the number successfully replayed.
 * Failed items are either retried (if under max retries) or dropped.
 */
export async function replayQueue(): Promise<{ replayed: number; failed: number }> {
  const items = await getAllQueued();
  if (items.length === 0) return { replayed: 0, failed: 0 };

  let replayed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...item.headers,
        },
        body: item.body,
        credentials: 'include',
      });

      if (response.ok) {
        await removeQueued(item.timestamp);
        replayed++;
      } else if (response.status === 401 || response.status === 403) {
        // Auth failure — don't retry, remove from queue
        await removeQueued(item.timestamp);
        failed++;
      } else {
        // Server error — retry later if under limit
        if ((item.retryCount || 0) >= MAX_RETRIES) {
          await removeQueued(item.timestamp);
          failed++;
        } else {
          await incrementRetry(item.timestamp);
          failed++;
        }
      }
    } catch {
      // Network error — still offline? Stop processing.
      if ((item.retryCount || 0) >= MAX_RETRIES) {
        await removeQueued(item.timestamp);
        failed++;
      } else {
        await incrementRetry(item.timestamp);
      }
      break; // Stop replaying — we're likely offline again
    }
  }

  // Dispatch event so UI can update
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mutation-replayed'));
  }

  return { replayed, failed };
}

/**
 * Get the count of queued mutations.
 */
export async function getQueueCount(): Promise<number> {
  try {
    const items = await getAllQueued();
    return items.length;
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
