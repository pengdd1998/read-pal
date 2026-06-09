'use client';

import { useTranslations } from 'next-intl';
import type { SyncResult } from '@/lib/offline-sync';

interface SyncingBannerProps {
 queuedCount: number;
}

/** Shown while flushing queued mutations to the server. */
export function SyncingBanner({ queuedCount }: SyncingBannerProps) {
 const t = useTranslations('offline');

 return (
 <div
  className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] shadow-lg bg-blue-500/90 text-white animate-fade-in"
  role="status"
 >
  <span className="flex items-center gap-2">
  <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
  {queuedCount > 0 ? t('syncing_count', { count: queuedCount }) : t('syncing')}
  </span>
 </div>
 );
}

interface SyncResultBannerProps {
 result: SyncResult;
}

/** Shown after sync completes with success or partial failure. */
export function SyncResultBanner({ result }: SyncResultBannerProps) {
 const t = useTranslations('offline');
 const isSuccess = result.failed === 0;

 return (
 <div
  className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg animate-fade-in ${
  isSuccess ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white'
  }`}
  role="status"
 >
  <span className="flex items-center gap-1.5">
  {isSuccess ? (
   <>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
   </svg>
   {t('sync_success', { count: result.succeeded })}
   </>
  ) : (
   <>
   {t('sync_partial', { count: result.succeeded, total: result.total })}
   </>
  )}
  </span>
 </div>
 );
}

interface OfflineBannerProps {
 queuedCount: number;
}

/** Shown when the browser reports offline status. */
export function OfflineBanner({ queuedCount }: OfflineBannerProps) {
 const t = useTranslations('offline');

 return (
 <div
  className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] shadow-lg bg-red-500/90 text-white animate-fade-in"
  role="status"
 >
  <span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-white/60" />
  {queuedCount > 0 ? t('offline_queued', { count: queuedCount }) : t('offline_saved_locally')}
  </span>
 </div>
 );
}

interface BackOnlineBannerProps {
 onDismiss: () => void;
}

/** Shown briefly when connectivity is restored. */
export function BackOnlineBanner({ onDismiss }: BackOnlineBannerProps) {
 const t = useTranslations('offline');

 return (
 <div
  className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-medium min-h-[44px] shadow-lg bg-emerald-500/90 text-white animate-fade-in cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
  onClick={onDismiss}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDismiss(); } }}
  role="status"
  tabIndex={0}
  aria-label={t('back_online')}
 >
  <span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
  {t('back_online')}
  </span>
 </div>
 );
}

interface QueueBannerProps {
 queuedCount: number;
 onSync: () => void;
}

/** Shown when online but mutations are still queued. */
export function QueueBanner({ queuedCount, onSync }: QueueBannerProps) {
 const t = useTranslations('offline');

 return (
 <button
  onClick={onSync}
  className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium min-h-[44px] shadow-lg bg-amber-500/90 text-white hover:bg-amber-600 transition-colors animate-fade-in focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  role="status"
 >
  <span className="flex items-center gap-1.5">
  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
  {t('sync_queued', { count: queuedCount })}
  </span>
 </button>
 );
}
