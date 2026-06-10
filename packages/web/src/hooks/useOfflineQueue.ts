'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { getQueueCount, queueMutation as enqueue, replayQueue, clearQueue } from '@/lib/offline-queue';

/**
 * Queue mutations while offline and replay them when connectivity returns.
 *
 * Unlike the previous implementation, this uses IndexedDB-backed action
 * descriptors so queued work survives page refreshes.
 *
 * Usage:
 *   const { queueMutation, pendingCount, replayAll, clearAll } = useOfflineQueue();
 *   queueMutation('/api/annotations', 'POST', data);
 */
export function useOfflineQueue() {
  const { isOnline, justCameBackOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const processingRef = useRef(false);

  // Refresh count from IndexedDB
  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setPendingCount(count);
  }, []);

  // Load initial count
  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  // Listen for mutation events
  useEffect(() => {
    const onQueued = () => refreshCount();
    const onReplayed = () => refreshCount();
    window.addEventListener('mutation-queued', onQueued);
    window.addEventListener('mutation-replayed', onReplayed);
    return () => {
      window.removeEventListener('mutation-queued', onQueued);
      window.removeEventListener('mutation-replayed', onReplayed);
    };
  }, [refreshCount]);

  // Replay all queued mutations
  const replayAll = useCallback(async () => {
    if (processingRef.current || !isOnline) return;
    processingRef.current = true;
    try {
      await replayQueue();
    } finally {
      processingRef.current = false;
      await refreshCount();
    }
  }, [isOnline, refreshCount]);

  // Flush queue when coming back online
  useEffect(() => {
    if (justCameBackOnline && pendingCount > 0) {
      replayAll();
    }
  }, [justCameBackOnline, pendingCount, replayAll]);

  /**
   * Queue a mutation. If online, tries immediately first;
   * falls back to IndexedDB queue on failure.
   */
  const queueMutation = useCallback(
    async (
      url: string,
      method: string,
      body?: unknown,
      headers?: Record<string, string>,
      description?: string,
    ) => {
      if (isOnline) {
        // Try immediately when online
        try {
          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'include',
          });
          if (response.ok) return;
          // Auth errors: don't queue
          if (response.status === 401 || response.status === 403) return;
        } catch {
          // Network error — fall through to queue
        }
      }

      // Queue for later replay
      await enqueue(url, method, body, headers, description);
      await refreshCount();
    },
    [isOnline, refreshCount],
  );

  return {
    queueMutation,
    pendingCount,
    replayAll,
    clearAll: clearQueue,
  };
}
