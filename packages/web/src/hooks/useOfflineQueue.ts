'use client';

import { useRef, useCallback, useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

interface QueuedAction {
  id: string;
  action: () => Promise<void>;
  description: string;
  queuedAt: number;
}

const STORAGE_KEY = 'read-pal-offline-queue';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_QUEUE_SIZE = 50;

/**
 * Queue actions while offline and replay them when connectivity returns.
 *
 * Usage:
 *   const { queueAction, pendingCount } = useOfflineQueue();
 *   queueAction(() => api.post('/api/annotations', data), 'Save annotation');
 */
export function useOfflineQueue() {
  const { isOnline, justCameBackOnline } = useOnlineStatus();
  const queueRef = useRef<QueuedAction[]>([]);
  const processingRef = useRef(false);

  // Load persisted queue on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{ id: string; description: string; queuedAt: number }>;
        // Only keep metadata — actual functions can't be serialized
        // so stale entries are pruned on reload
        const now = Date.now();
        const valid = parsed.filter((item) => now - item.queuedAt < MAX_AGE_MS);
        queueRef.current = valid as QueuedAction[];
      }
    } catch {
      // Ignore corrupt data
    }
  }, []);

  // Persist queue metadata (not functions) for diagnostics
  const persistMetadata = useCallback(() => {
    try {
      const metadata = queueRef.current.map(({ id, description, queuedAt }) => ({
        id,
        description,
        queuedAt,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    } catch {
      // Storage full or unavailable
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || !isOnline) return;
    processingRef.current = true;

    const queue = queueRef.current;
    queueRef.current = [];
    persistMetadata();

    for (const item of queue) {
      try {
        await item.action();
      } catch {
        // Re-queue failed items (with the same function reference)
        queueRef.current.push(item);
      }
    }

    processingRef.current = false;
    persistMetadata();
  }, [isOnline, persistMetadata]);

  // Flush queue when coming back online
  useEffect(() => {
    if (justCameBackOnline && queueRef.current.length > 0) {
      processQueue();
    }
  }, [justCameBackOnline, processQueue]);

  const queueAction = useCallback(
    (action: () => Promise<void>, description: string) => {
      if (isOnline) {
        // If online, try immediately
        action().catch(() => {
          // On failure, queue for retry
          const item: QueuedAction = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action,
            description,
            queuedAt: Date.now(),
          };
          queueRef.current.push(item);
          if (queueRef.current.length > MAX_QUEUE_SIZE) {
            queueRef.current = queueRef.current.slice(-MAX_QUEUE_SIZE);
          }
          persistMetadata();
        });
      } else {
        const item: QueuedAction = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          action,
          description,
          queuedAt: Date.now(),
        };
        queueRef.current.push(item);
        if (queueRef.current.length > MAX_QUEUE_SIZE) {
          queueRef.current = queueRef.current.slice(-MAX_QUEUE_SIZE);
        }
        persistMetadata();
      }
    },
    [isOnline, persistMetadata],
  );

  return {
    queueAction,
    pendingCount: queueRef.current.length,
    processQueue,
  };
}
