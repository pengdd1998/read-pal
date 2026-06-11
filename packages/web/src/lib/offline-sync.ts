/**
 * Offline Sync Utilities
 *
 * Provides sync logic for flushing queued mutations to the server.
 * Extracted from NetworkStatus to separate IO concerns from UI.
 */

import { getAuthToken } from './auth-fetch';
import { clearQueue } from './offline-queue';
import { warn } from './logger';

export interface SyncResult {
  succeeded: number;
  failed: number;
  total: number;
}

const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const DB_NAME = 'readpal-offline';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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

/** Count queued mutations in IndexedDB. */
export async function countQueuedMutations(): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readonly');
    const store = tx.objectStore('mutations');
    return new Promise((resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  } catch (err) {
    warn('OfflineSync: failed to count queued mutations', err);
    return 0;
  }
}

/** Purge queue items older than 24 hours. Returns count purged. */
export async function purgeStaleQueue(): Promise<number> {
  const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readwrite');
    const store = tx.objectStore('mutations');
    const items = await new Promise<any[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    let purged = 0;
    for (const item of items) {
      if (item.timestamp < cutoff) {
        store.delete(item.timestamp);
        purged++;
      }
    }
    return purged;
  } catch (err) {
    warn('OfflineSync: failed to purge stale queue items', err);
    return 0;
  }
}

/** Clear queue if not authenticated, otherwise purge stale items. */
export async function initQueue(): Promise<number> {
  if (!getAuthToken()) {
    await clearQueue();
    return 0;
  }
  await purgeStaleQueue();
  return countQueuedMutations();
}

/** Flush queued mutations to the server. Returns sync result. */
export async function syncQueuedMutations(): Promise<SyncResult | null> {
  if (!navigator.onLine) return null;

  const db = await openDB();
  const tx = db.transaction('mutations', 'readonly');
  const store = tx.objectStore('mutations');
  const items = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (items.length === 0) return null;

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const token = getAuthToken();
      const headers = { ...item.headers };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
      });

      if (response.ok) {
        const deleteTx = db.transaction('mutations', 'readwrite');
        deleteTx.objectStore('mutations').delete(item.timestamp);
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      warn('OfflineSync: failed to sync mutation', err);
      failed++;
    }
  }

  const result: SyncResult = { succeeded, failed, total: items.length };

  // Dispatch event so other components can refresh stale data
  if (succeeded > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('offline-sync-complete', {
        detail: { succeeded, failed },
      }),
    );
  }

  return result;
}
