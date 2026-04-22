'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';
import type { FlashcardStats } from './types';

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
        if (!cancelled && res.data) setStats(res.data.stats);
      })
      .catch(() => { if (!cancelled) setError(true); })
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
        <p className="text-xs text-gray-400 mb-2">{t('failed_load_flashcards')}</p>
        <button onClick={fetchStats} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">{t('retry')}</button>
      </div>
    );
  }

  if (!stats || stats.total === 0) return null;

  return (
    <Link
      href="/flashcards"
      className="block card group hover:border-teal-200 dark:hover:border-teal-800 transition-all duration-200"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/30 flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">{'\uD83D\uDCC7'}</span>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {t('flashcard_review_title')}
          </h3>
          <div className="flex items-center gap-3 mt-1">
            {stats.due > 0 ? (
              <>
                <span className="text-xs font-medium text-teal-600 dark:text-teal-400">{t('due_now', { count: stats.due })}</span>
                <span className="text-xs text-gray-400">{t('reviewed', { count: stats.reviewed })}</span>
              </>
            ) : (
              <span className="text-xs text-gray-500">{t('all_caught_up')}</span>
            )}
          </div>
        </div>
        {stats.due > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {t('review_button')}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
      </div>
    </Link>
  );
});
