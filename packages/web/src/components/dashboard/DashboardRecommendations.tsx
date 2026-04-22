'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';
import type { RecommendationItem } from './types';

export const DashboardRecommendations = memo(function DashboardRecommendations() {
  const t = useTranslations('dashboard');
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const topRecs = useMemo(() => recs.slice(0, 3), [recs]);

  const fetchRecs = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<{ recommendations: RecommendationItem[] }>('/api/recommendations')
      .then((res) => {
        if (!cancelled && res.data) {
          setRecs(res.data.recommendations ?? []);
        }
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchRecs(); }, [fetchRecs]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-36 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">{t('failed_load_recommendations')}</p>
        <button onClick={fetchRecs} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">{t('retry')}</button>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('recommended_title')}</h3>
        <Link href="/search" className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline">{t('see_all')}</Link>
      </div>
      <div className="space-y-2">
        {topRecs.map((r, i) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
            <div className="w-8 h-10 rounded bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">{'\uD83D\uDCD6'}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{r.title}</p>
              <p className="text-[10px] text-gray-400 truncate">{r.author}</p>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 whitespace-nowrap">{r.genre}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
