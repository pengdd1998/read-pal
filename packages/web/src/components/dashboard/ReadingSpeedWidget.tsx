'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';

interface ReadingSpeedBook {
 bookId: string;
 title: string;
 author: string;
 wpm: number;
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
  .catch((err) => { console.warn('ReadingSpeedWidget: fetch failed', err); if (!cancelled) setError(true); })
  .finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, []);

 useEffect(() => { return fetchData(); }, [fetchData]);

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
  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('reading_speed_load_failed')}</p>
  <button
   onClick={fetchData}
   className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {t('retry')}
  </button>
  </div>
 );
 }

 if (books.length === 0) return null;

 const activeBooks = books.filter((b) => b.wpm > 0);
 if (activeBooks.length === 0) return null;

 const maxWpm = Math.max(...activeBooks.map((b) => b.wpm), 1);
 const avgWpm = activeBooks.length > 0
 ? Math.round(activeBooks.reduce((sum, b) => sum + b.wpm, 0) / activeBooks.length)
 : 0;

 return (
 <div className="card">
  <div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('reading_speed_title')}</h3>
  <span className="text-[10px] text-gray-400 dark:text-gray-500">
   {avgWpm > 0 ? `${avgWpm} ${t('words_min')}` : t('words_min')}
  </span>
  </div>
  <div className="space-y-2.5">
  {activeBooks.slice(0, 6).map((b) => (
   <div key={b.bookId}>
   <div className="flex items-center justify-between mb-1">
    <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate max-w-[60%]">{b.title}</span>
    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{b.wpm} {t('words_min')}</span>
   </div>
   <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2" role="progressbar" aria-valuenow={Math.round(Math.min(100, Math.max(5, (b.wpm / maxWpm) * 100)))} aria-valuemin={0} aria-valuemax={100}>
    <div
    className="rounded-full h-2 transition-all duration-500 bg-gradient-to-r from-amber-400 to-orange-400 dark:from-amber-500 dark:to-orange-500"
    style={{ width: `${Math.min(100, Math.max(5, (b.wpm / maxWpm) * 100))}%` }}
    />
   </div>
   </div>
  ))}
  </div>
 </div>
 );
});
