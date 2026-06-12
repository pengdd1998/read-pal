'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { isDisplayableAuthor } from '@/lib/book-cover';
import { SkeletonPulse } from './SkeletonPulse';
import type { RecommendationItem } from './types';
import { warn } from '@/lib/logger';

const RecommendationCard = memo(function RecommendationCard({ r, genreLabel }: { r: RecommendationItem; genreLabel: string }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-1 transition-colors">
      <div className="w-8 h-10 rounded bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0">
        <span className="text-xs">{'📖'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
        {isDisplayableAuthor(r.author) && <p className="text-[10px] text-gray-500 truncate">{r.author}</p>}
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-1 text-gray-500 whitespace-nowrap">{genreLabel}</span>
    </div>
  );
});

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
  .catch((err) => { warn('DashboardRecommendations: fetch failed', err); if (!cancelled) setError(true); })
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
  <p className="text-xs text-gray-500 mb-2">{t('failed_load_recommendations')}</p>
  <button type="button" onClick={fetchRecs} className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400">{t('retry')}</button>
  </div>
 );
 }

 if (recs.length === 0) return null;

 return (
 <div className="card">
  <div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-semibold text-gray-900">{t('recommended_title')}</h3>
  <Link href="/search" prefetch={false} className="text-[10px] text-primary-600 dark:text-primary-400 hover:underline">{t('see_all')}</Link>
  </div>
  <div className="space-y-2">
  {topRecs.map((r) => (
   <RecommendationCard key={r.title + '-' + r.author} r={r} genreLabel={r.genre ? t(`genre_${r.genre.toLowerCase().replace('-', '_')}`) || r.genre : ''} />
  ))}
  </div>
 </div>
 );
});
