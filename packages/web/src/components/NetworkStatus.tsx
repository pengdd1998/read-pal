'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
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
 const t = useTranslations('offline');
 const [offline, setOffline] = useState(false);
 const [showBanner, setShowBanner] = useState(false);
 const [queuedCount, setQueuedCount] = useState(0);
 const [syncing, setSyncing] = useState(false);
 const [syncError, setSyncError] = useState(false);
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
  setSyncError(true);
 }
 setSyncing(false);
 }, []);

 useEffect(() => {
 let mounted = true;
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
  if (!mounted) return;
  setOffline(false);
  setShowBanner(true);
  try {
  const count = await countQueuedMutations();
  if (!mounted) return;
  setQueuedCount(count);
  if (count > 0) {
   syncTimer = setTimeout(() => syncQueue(), 1000);
  }
  } catch (err) {
  console.warn('NetworkStatus: failed to count queued mutations on reconnect', err);
  if (mounted) setQueuedCount(0);
  }
  // Auto-hide "back online" after 4s
  hideTimer = setTimeout(() => {
  if (!mounted) return;
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
  if (!mounted) return;
  setQueuedCount(count);
  if (count > 0 && navigator.onLine) {
   syncTimer = setTimeout(() => syncQueue(), 1000);
  }
  } catch (err) {
  console.warn('NetworkStatus: failed to initialize offline queue', err);
  if (mounted) setQueuedCount(0);
  }
 })();

 // Listen for mutation queued events from the page
 const onMutationQueued = async () => {
  try {
  const count = await countQueuedMutations();
  if (!mounted) return;
  setQueuedCount(count);
  } catch (err) {
  console.warn('NetworkStatus: failed to count queued mutations after queue event', err);
  if (mounted) setQueuedCount(0);
  }
 };
 window.addEventListener('mutation-queued', onMutationQueued);

 return () => {
  mounted = false;
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

 if (syncError) {
 return (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
   <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm shadow-lg">
   <span>{t('sync_failed')}</span>
   <button onClick={() => setSyncError(false)} className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-200 font-medium text-xs min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">{t('dismiss')}</button>
   </div>
  </div>
 );
 }

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
