'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/auth-fetch';
import {
 countQueuedMutations,
 initQueue,
 syncQueuedMutations,
} from '@/lib/offline-sync';
import type { SyncResult } from '@/lib/offline-sync';
import {
 SyncingBanner,
 SyncResultBanner,
 OfflineBanner,
 BackOnlineBanner,
 QueueBanner,
} from './NetworkStatusBanner';

export function NetworkStatus() {
 const [offline, setOffline] = useState(false);
 const [showBanner, setShowBanner] = useState(false);
 const [queuedCount, setQueuedCount] = useState(0);
 const [syncing, setSyncing] = useState(false);
 const [lastSync, setLastSync] = useState<SyncResult | null>(null);
 const [isAuthenticated] = useState(!!getAuthToken());

 const syncQueue = useCallback(async () => {
 if (!navigator.onLine) return;
 setSyncing(true);
 try {
  const result = await syncQueuedMutations();
  if (result) {
  setLastSync(result);
  const remaining = await countQueuedMutations();
  setQueuedCount(remaining);
  }
 } catch (err) {
  console.warn('NetworkStatus: failed to sync offline queue', err);
 }
 setSyncing(false);
 }, []);

 useEffect(() => {
 setOffline(!navigator.onLine);
 let syncTimer: ReturnType<typeof setTimeout> | undefined;
 let hideTimer: ReturnType<typeof setTimeout> | undefined;

 const goOffline = () => {
  setOffline(true);
  setShowBanner(true);
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = undefined; }
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = undefined; }
 };

 const goOnline = async () => {
  setOffline(false);
  setShowBanner(true);
  try {
  const count = await countQueuedMutations();
  setQueuedCount(count);
  if (count > 0) {
   syncTimer = setTimeout(() => syncQueue(), 1000);
  }
  } catch (err) {
  console.warn('NetworkStatus: failed to count queued mutations on reconnect', err);
  setQueuedCount(0);
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
 (async () => {
  try {
  const count = await initQueue();
  setQueuedCount(count);
  if (count > 0 && navigator.onLine) {
   syncTimer = setTimeout(() => syncQueue(), 1000);
  }
  } catch (err) {
  console.warn('NetworkStatus: failed to initialize offline queue', err);
  setQueuedCount(0);
  }
 })();

 // Listen for mutation queued events from the page
 const onMutationQueued = async () => {
  try {
  const count = await countQueuedMutations();
  setQueuedCount(count);
  } catch (err) {
  console.warn('NetworkStatus: failed to count queued mutations after queue event', err);
  setQueuedCount(0);
  }
 };
 window.addEventListener('mutation-queued', onMutationQueued);

 return () => {
  if (syncTimer) clearTimeout(syncTimer);
  if (hideTimer) clearTimeout(hideTimer);
  window.removeEventListener('offline', goOffline);
  window.removeEventListener('online', goOnline);
  window.removeEventListener('mutation-queued', onMutationQueued);
 };
 }, [syncQueue]);

 // Don't render for unauthenticated users
 if (!isAuthenticated) return null;

 // Don't show banner if nothing to report
 if (!showBanner && queuedCount === 0) return null;

 if (syncing) return <SyncingBanner queuedCount={queuedCount} />;

 if (lastSync && lastSync.total > 0) {
 return <SyncResultBanner result={lastSync} />;
 }

 if (offline && showBanner) {
 return <OfflineBanner queuedCount={queuedCount} />;
 }

 if (!offline && showBanner) {
 return <BackOnlineBanner onDismiss={() => setShowBanner(false)} />;
 }

 if (queuedCount > 0 && !offline) {
 return <QueueBanner queuedCount={queuedCount} onSync={syncQueue} />;
 }

 return null;
}
