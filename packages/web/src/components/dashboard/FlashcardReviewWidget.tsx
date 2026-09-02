'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';
import type { FlashcardStats } from './types';
import { warn } from '@/lib/logger';

export const FlashcardReviewWidget = memo(function FlashcardReviewWidget() {
 const t = useTranslations('dashboard');
 const [stats, setStats] = useState<FlashcardStats | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);

 const fetchStats = useCallback(() => {
 let cancelled = false;
 setLoading(true);
 setError(false);
 api.get<{ stats: FlashcardStats }>('/api/flashcards/review?limit=1')
  .then((res) => {
  if (cancelled) return;
  if (res.success && res.data) {
    setStats(res.data.stats);
  } else {
    setError(true);
  }
  })
  .catch((err) => { warn('FlashcardReviewWidget: fetch failed', err); if (!cancelled) setError(true); })
  .finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, []);

 useEffect(() => { return fetchStats(); }, [fetchStats]);

 if (loading) {
 return (
  <div className="card">
  <div className="flex items-center gap-4">
   <SkeletonPulse className="w-12 h-12 rounded-xl flex-shrink-0" />
   <div className="flex-1 space-y-2">
   <SkeletonPulse className="h-4 w-32" />
   <SkeletonPulse className="h-3 w-24" />
   </div>
  </div>
  </div>
 );
 }

 if (error) {
 return (
  <div className="card text-center py-4">
  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t('failed_load_flashcards')}</p>
  <button type="button" onClick={fetchStats} className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400">{t('retry')}</button>
  </div>
 );
 }

 if (!stats || stats.total === 0) return null;

 return (
 <Link
  href="/flashcards"
  className="block card group hover:border-amber-200 dark:hover:border-amber-800 transition-all duration-200"
 >
  <div className="flex items-center gap-4">
  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 flex items-center justify-center flex-shrink-0">
   <span className="text-2xl">{'\uD83D\uDCC7'}</span>
  </div>
  <div className="flex-1">
   <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
   {t('flashcard_review_title')}
   </h3>
   <div className="flex items-center gap-3 mt-1">
   {stats.due > 0 ? (
    <>
    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('due_now', { count: stats.due })}</span>
    <span className="text-xs text-gray-500 dark:text-gray-400">{t('reviewed', { count: stats.reviewed })}</span>
    </>
   ) : (
    <span className="text-xs text-gray-500 dark:text-gray-400">{t('all_caught_up')}</span>
   )}
   </div>
  </div>
  {stats.due > 0 && (
   <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200">
   {t('review_button')}
   <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
   </svg>
   </span>
  )}
  </div>
 </Link>
 );
});
