'use client';

import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';

interface DailyEntry {
 date: string;
 minutes: number;
 pages: number;
}

interface WeeklySummaryData {
 weekStart: string;
 weekEnd: string;
 minutesRead: number;
 pagesRead: number;
 highlightsCount: number;
 notesCount: number;
 booksActive: number;
 streakDays: number;
 currentStreak: number;
 longestStreak: number;
 dailyBreakdown: DailyEntry[];
}

export const WeeklySummaryWidget = memo(function WeeklySummaryWidget() {
 const t = useTranslations('dashboard');
 const locale = useLocale();
 const DAY_LABELS = useMemo(
 () => [t('day_mon'), t('day_tue'), t('day_wed'), t('day_thu'), t('day_fri'), t('day_sat'), t('day_sun')],
 [t],
 );
 const [data, setData] = useState<WeeklySummaryData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(false);

 const fetchData = useCallback(() => {
 let cancelled = false;
 setLoading(true);
 setError(false);
 api.get<WeeklySummaryData>('/api/stats/weekly-summary')
  .then((res) => {
  if (!cancelled && res.data) setData(res.data);
  })
  .catch((err) => { console.warn('WeeklySummaryWidget: fetch failed', err); if (!cancelled) setError(true); })
  .finally(() => { if (!cancelled) setLoading(false); });
 return () => { cancelled = true; };
 }, []);

 useEffect(() => { return fetchData(); }, [fetchData]);

 if (loading) {
 return (
  <div className="card">
  <SkeletonPulse className="h-4 w-32 mb-3" />
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
   {[...Array(4)].map((_, i) => (
   <SkeletonPulse key={i} className="h-14 w-full" />
   ))}
  </div>
  <SkeletonPulse className="h-20 w-full" />
  </div>
 );
 }

 if (error) {
 return (
  <div className="card text-center py-4">
  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('weekly_summary_load_failed')}</p>
  <button
   onClick={fetchData}
   className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {t('retry')}
  </button>
  </div>
 );
 }

 if (!data) return null;

 const isEmpty = data.minutesRead === 0 && data.pagesRead === 0;
 const maxMinutes = Math.max(...data.dailyBreakdown.map((d) => d.minutes), 1);

 return (
 <div className="card">
  {/* Header */}
  <div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
   {t('weekly_summary_title')}
  </h3>
  <span className="text-[10px] text-gray-400 dark:text-gray-500">
   {(() => {
    const d1 = new Date(data.weekStart + 'T00:00:00');
    const d2 = new Date(data.weekEnd + 'T00:00:00');
    const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${d1.toLocaleDateString(locale, fmt)} ~ ${d2.toLocaleDateString(locale, fmt)}`;
   })()}
  </span>
  </div>

  {isEmpty ? (
  <div className="text-center py-6">
   <p className="text-xs text-gray-400 dark:text-gray-500">{t('weekly_summary_empty')}</p>
  </div>
  ) : (
  <>
   {/* Key stats grid */}
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
   <StatCard label={t('weekly_summary_minutes')} value={`${data.minutesRead}`} unit={t('weekly_summary_minutes_unit')} />
   <StatCard label={t('weekly_summary_pages')} value={`${data.pagesRead}`} unit={t('weekly_summary_pages_unit')} />
   <StatCard label={t('weekly_summary_highlights')} value={`${data.highlightsCount}`} />
   <StatCard
    label={t('weekly_summary_streak')}
    value={`${data.currentStreak}`}
    unit={t('weekly_summary_streak_unit')}
   />
   </div>

   {/* Mini bar chart */}
   <div className="flex items-end gap-1 h-16">
   {data.dailyBreakdown.map((day, i) => {
    const height = day.minutes > 0 ? Math.max((day.minutes / maxMinutes) * 100, 8) : 4;
    const isToday = day.date === new Date().toISOString().slice(0, 10);
    return (
    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
     <div
     role="img"
     aria-label={t('daily_tooltip', { date: day.date, minutes: day.minutes, pages: day.pages })}
     className={`w-full rounded-sm transition-all duration-300 ${
      isToday
      ? 'bg-amber-500 dark:bg-amber-400'
      : day.minutes > 0
       ? 'bg-amber-300 dark:bg-amber-600'
       : 'bg-surface-2'
     }`}
     style={{ height: `${height}%` }}
     title={t('daily_tooltip', { date: day.date, minutes: day.minutes, pages: day.pages })}
     />
     <span className={`text-[9px] ${isToday ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
     {DAY_LABELS[i]}
     </span>
    </div>
    );
   })}
   </div>
  </>
  )}
 </div>
 );
});

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
 return (
 <div className="text-center p-2 rounded-lg bg-surface-1">
  <div>
  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{value}</span>
  {unit && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">{unit}</span>}
  </div>
  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
 </div>
 );
}
