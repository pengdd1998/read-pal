'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/auth-fetch';

interface SyncResult {
  succeeded: number;
  failed: number;
  total: number;
}

export function NetworkStatus() {
  const [offline, setOffline] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  // Check IndexedDB mutation queue count
  const checkQueueCount = useCallback(async () => {
    try {
      const db = await openDB();
      const tx = db.transaction('mutations', 'readonly');
      const store = tx.objectStore('mutations');
      return new Promise<number>((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }, []);

  // Sync queued mutations
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const db = await openDB();
      const tx = db.transaction('mutations', 'readonly');
      const store = tx.objectStore('mutations');
      const items = await new Promise<any[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (items.length === 0) {
        setSyncing(false);
        return;
      }

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
        } catch {
          failed++;
        }
      }

      setLastSync({ succeeded, failed, total: items.length });
      const remaining = await checkQueueCount();
      setQueuedCount(remaining);

      // Invalidate API client caches to show fresh data
      if (succeeded > 0 && typeof window !== 'undefined') {
        // Force a refresh of any stale data
        window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: { succeeded, failed } }));
      }
    } catch {
      // Sync failed — will retry next time
    }
    setSyncing(false);
  }, [checkQueueCount]);

  useEffect(() => {
    setOffline(!navigator.onLine);
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const goOffline = () => {
      setOffline(true);
      setShowBanner(true);
      // Clear any pending online timers
      if (syncTimer) { clearTimeout(syncTimer); syncTimer = undefined; }
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
    };

    const goOnline = async () => {
      setOffline(false);
      setShowBanner(true);
      // Auto-sync when coming back online
      const count = await checkQueueCount();
      setQueuedCount(count);
      if (count > 0) {
        syncTimer = setTimeout(() => syncQueue(), 1000);
      }
      // Auto-hide "back online" after 4s
      hideTimer = setTimeout(() => {
        setShowBanner(false);
        setLastSync(null);
      }, 4000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    // Initial queue check
    checkQueueCount().then(setQueuedCount);

    // Listen for mutation queued events from the page
    const onMutationQueued = () => {
      checkQueueCount().then(setQueuedCount);
    };
    window.addEventListener('mutation-queued', onMutationQueued);

    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('mutation-queued', onMutationQueued);
    };
  }, [checkQueueCount, syncQueue]);

  // Don't show banner if nothing to report
  if (!showBanner && queuedCount === 0) return null;

  // Show sync progress when syncing
  if (syncing) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg bg-blue-500/90 text-white animate-fade-in" role="status">
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Syncing {queuedCount > 0 ? `${queuedCount} queued change${queuedCount > 1 ? 's' : ''}` : '...'}
        </span>
      </div>
    );
  }

  // Show sync result
  if (lastSync && lastSync.total > 0) {
    return (
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-fade-in ${
          lastSync.failed === 0 ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white'
        }`}
        role="status"
      >
        <span className="flex items-center gap-1.5">
          {lastSync.failed === 0 ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {lastSync.succeeded} change{lastSync.succeeded !== 1 ? 's' : ''} synced
            </>
          ) : (
            <>
              {lastSync.succeeded} synced, {lastSync.failed} failed — will retry later
            </>
          )}
        </span>
      </div>
    );
  }

  // Offline indicator with queue count
  if (offline && showBanner) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg bg-red-500/90 text-white animate-fade-in"
        role="status"
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white/60" />
          Offline{queuedCount > 0 ? ` — ${queuedCount} change${queuedCount > 1 ? 's' : ''} queued` : ' — changes saved locally'}
        </span>
      </div>
    );
  }

  // Back online indicator
  if (!offline && showBanner) {
    return (
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-medium shadow-lg bg-emerald-500/90 text-white animate-fade-in cursor-pointer"
        onClick={() => setShowBanner(false)}
        role="status"
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Back online
        </span>
      </div>
    );
  }

  // Queue indicator when online but has pending items
  if (queuedCount > 0 && !offline) {
    return (
      <button
        onClick={syncQueue}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg bg-amber-500/90 text-white hover:bg-amber-600 transition-colors animate-fade-in"
        role="status"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync {queuedCount} queued change{queuedCount > 1 ? 's' : ''}
        </span>
      </button>
    );
  }

  return null;
}

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
