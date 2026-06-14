'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';
import { warn } from '@/lib/logger';

interface ReadingSpeedBook {
 bookId: string;
 title: string;
 author: string;
 wpm: number;
 averagePagesPerHour: number;
 totalMinutes: number;
}

export const ReadingSpeedWidget = memo(function ReadingSpeedWidget() {
 const t = useTranslations('dashboard');
 const [books, setBooks] = useState<ReadingSpeedBook[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);

 const fetchData = useCallback(() => {
 let cancelled = false;
 setLoading(true);
 setError(false);
 api.get<ReadingSpeedBook[]>('/api/stats/reading-speed/by-book')
  .then((res) => {
  if (!cancelled && res.success && Array.isArray(res.data)) {
   setBooks(res.data);
  } else if (!cancelled) {
   setError(true);
  }
  })
  .catch((err) => { warn('ReadingSpeedWidget: fetch failed', err); if (!cancelled) setError(true); })
  .finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, []);

 useEffect(() => { return fetchData(); }, [fetchData]);

 const { activeBooks, maxPph, avgPph } = useMemo(() => {
   // Use pages-per-hour rather than the derived wpm: the backend's
   // wpm = pph * 250 / 60 assumes 250 words/page, which is wildly off
   // for EPUBs (where "page" is a chapter index) and only approximate
   // for PDFs. pagesPerHour is what we actually measure.
   const filtered = books.filter((b) => (b.averagePagesPerHour || 0) > 0);
   const max = Math.max(...filtered.map((b) => b.averagePagesPerHour || 0), 1);
   const avg = filtered.length > 0
     ? Math.round((filtered.reduce((sum, b) => sum + (b.averagePagesPerHour || 0), 0) / filtered.length) * 10) / 10
     : 0;
   return { activeBooks: filtered, maxPph: max, avgPph: avg };
 }, [books]);

 if (loading) {
 return (
  <div className="card">
  <SkeletonPulse className="h-4 w-36 mb-3" />
  <div className="space-y-3">
   {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-8 w-full" />)}
  </div>
  </div>
 );
 }

 if (error) {
 return (
  <div className="card text-center py-4">
  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{t('reading_speed_load_failed')}</p>
  <button type="button"
   onClick={fetchData}
   className="min-h-[44px] inline-flex items-center text-xs text-amber-600 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {t('retry')}
  </button>
  </div>
 );
 }

 if (books.length === 0 || activeBooks.length === 0) return null;

 return (
 <div className="card">
  <div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('reading_speed_title')}</h3>
  <span className="text-[10px] text-gray-600 dark:text-gray-400">
   {avgPph > 0 ? `${avgPph} ${t('pages_hour')}` : t('pages_hour')}
  </span>
  </div>
  <div className="space-y-2.5">
  {activeBooks.slice(0, 6).map((b) => {
   const pph = b.averagePagesPerHour || 0;
   return (
   <div key={b.bookId}>
   <div className="flex items-center justify-between mb-1">
    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate max-w-[60%]">{b.title}</span>
    <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">{pph.toFixed(1)} {t('pages_hour')}</span>
   </div>
   <div className="w-full bg-surface-1 rounded-full h-2" role="progressbar" aria-valuenow={Math.round(Math.min(100, Math.max(5, (pph / maxPph) * 100)))} aria-valuemin={0} aria-valuemax={100}>
    <div
    className="rounded-full h-2 transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-400"
    style={{ width: `${Math.min(100, Math.max(5, (pph / maxPph) * 100))}%` }}
    />
   </div>
   </div>
  );})}
  </div>
 </div>
 );
});
