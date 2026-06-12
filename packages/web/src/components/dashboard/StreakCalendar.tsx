'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { DayCell, SkeletonHeatmap } from './StreakDayCell';
import { warn } from '@/lib/logger';

interface CalendarDay {
 date: string;
 pages: number;
 minutes: number;
}

interface ReadingCalendarData {
 calendar: CalendarDay[];
 currentStreak: number;
 longestStreak: number;
 totalDaysActive: number;
}

const MONTH_KEYS = ['month_jan', 'month_feb', 'month_mar', 'month_apr', 'month_may', 'month_jun', 'month_jul', 'month_aug', 'month_sep', 'month_oct', 'month_nov', 'month_dec'] as const;
const DAY_KEYS = ['', 'day_mon', '', 'day_wed', '', 'day_fri', ''] as const;

function parseISO(iso: string): Date {
 const [y, m, d] = iso.split('-').map(Number);
 return new Date(y, m - 1, d);
}

function todayISO(): string {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function StreakCalendarInner() {
 const t = useTranslations('stats');
 const tRef = useRef(t); tRef.current = t;
 const monthLabels = useMemo(() => MONTH_KEYS.map((k) => t(k)), [t]);
 const dayLabels = useMemo(() => DAY_KEYS.map((k) => (k ? t(k) : '')), [t]);
 const [data, setData] = useState<ReadingCalendarData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);

 const fetchData = useCallback(() => {
 let cancelled = false;
 setLoading(true);
 setError(null);
 api
  .get<ReadingCalendarData>('/api/stats/reading-calendar?months=6')
  .then((res) => {
  if (!cancelled && res.success && res.data) setData(res.data);
  })
  .catch((err) => {
  warn('StreakCalendar: failed to load calendar', err);
  if (!cancelled) setError(tRef.current('calendar_load_error'));
  })
  .finally(() => {
  if (!cancelled) setLoading(false);
  });
 return () => { cancelled = true; };
 }, []);

 useEffect(() => { return fetchData(); }, [fetchData]);

 const { weeks, monthMarkers } = useMemo(() => {
 if (!data || data.calendar.length === 0) {
  return { weeks: [] as (CalendarDay | null)[][], monthMarkers: [] as { label: string; col: number }[] };
 }

 const calendar = data.calendar;
 const lookup = new Map<string, CalendarDay>();
 for (const d of calendar) lookup.set(d.date, d);

 const today = new Date();
 const startDate = new Date(today);
 startDate.setDate(startDate.getDate() - calendar.length + 1);
 const startDow = startDate.getDay();
 const alignedStart = new Date(startDate);
 alignedStart.setDate(alignedStart.getDate() - startDow);

 const allDays: (CalendarDay | null)[] = [];
 const cursor = new Date(alignedStart);
 while (cursor <= today) {
  const yyyy = cursor.getFullYear();
  const mm = String(cursor.getMonth() + 1).padStart(2, '0');
  const dd = String(cursor.getDate()).padStart(2, '0');
  allDays.push(lookup.get(`${yyyy}-${mm}-${dd}`) ?? null);
  cursor.setDate(cursor.getDate() + 1);
 }

 const weekCols: (CalendarDay | null)[][] = [];
 for (let i = 0; i < allDays.length; i += 7) weekCols.push(allDays.slice(i, i + 7));

 const markers: { label: string; col: number }[] = [];
 let lastMonth = -1;
 for (let col = 0; col < weekCols.length; col++) {
  for (const day of weekCols[col]) {
  if (day) {
   const m = parseISO(day.date).getMonth();
   if (m !== lastMonth) {
   markers.push({ label: monthLabels[m], col });
   lastMonth = m;
   }
   break;
  }
  }
 }

 return { weeks: weekCols, monthMarkers: markers };
 }, [data, monthLabels]);

 const todayStr = todayISO();
 const totalDays = 180;

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-5 sm:p-6 shadow-sm">
  {/* Header */}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
  <div>
   <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('streak_title')}</h3>
   {loading ? (
   <div className="mt-1 h-4 w-40 bg-surface-1 rounded animate-pulse" />
   ) : error ? (
   <p className="text-sm text-red-500 dark:text-red-400 mt-1">{error}</p>
   ) : (
   <p className="text-sm text-gray-500 mt-0.5">
    {t('active_days', { active: data?.totalDaysActive ?? 0, total: totalDays })}
   </p>
   )}
  </div>
  {!loading && !error && data && (
   <div className="flex items-center gap-3 sm:gap-4">
   <div className="text-center">
    <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide font-medium">{t('streak_longest')}</div>
    <div className="text-lg font-bold text-gray-700 tabular-nums">{data.longestStreak}</div>
   </div>
   <div className="w-px h-8 bg-surface-2" />
   <div className="text-center">
    <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide font-medium">{t('streak_current')}</div>
    <div className="flex items-center justify-center gap-1">
    <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{data.currentStreak}</span>
    {data.currentStreak > 0 && <span className="text-xl" role="img" aria-label={t('fire_streak_aria')}>{'🔥'}</span>}
    </div>
   </div>
   </div>
  )}
  </div>

  {/* Heatmap Grid */}
  {loading ? (
  <SkeletonHeatmap />
  ) : error ? (
  <div className="h-32 flex flex-col items-center justify-center gap-2">
   <p className="text-sm text-gray-500">{error}</p>
   <button type="button" onClick={fetchData} className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400">{t('retry')}</button>
  </div>
  ) : (
  <div className="overflow-x-auto">
   <div className="flex mb-1 ml-[32px]">
   {monthMarkers.map((m, i) => {
    const nextCol = monthMarkers[i + 1]?.col ?? weeks.length;
    const spanCols = nextCol - m.col;
    return (
    <div key={`${m.label}-${m.col}`} className="text-[10px] text-gray-500 font-medium" style={{ width: `${spanCols * 16}px` }}>
     {spanCols >= 2 ? m.label : ''}
    </div>
    );
   })}
   </div>
   <div className="flex gap-0">
   <div className="flex flex-col gap-[3px] mr-1">
    {dayLabels.map((label, i) => (
    <div key={i} className="h-[13px] flex items-center text-[10px] text-gray-500 font-medium leading-none pr-1">{label}</div>
    ))}
   </div>
   <div className="flex gap-[3px]">
    {weeks.map((week, colIdx) => (
    <div key={colIdx} className="flex flex-col gap-[3px]">
     {week.map((day, rowIdx) => (
     <DayCell key={`${colIdx}-${rowIdx}`} day={day} isToday={day !== null && day.date === todayStr} />
     ))}
     {week.length < 7 && Array.from({ length: 7 - week.length }).map((_, i) => (
     <div key={`pad-${i}`} className="w-[13px] h-[13px]" />
     ))}
    </div>
    ))}
   </div>
   </div>
  </div>
  )}

  {/* Legend */}
  {!loading && !error && (
  <div className="flex items-center gap-1.5 mt-4 text-[10px] text-gray-500">
   <span>{t('heatmap_less')}</span>
   <div className="w-[13px] h-[13px] rounded-[3px] bg-surface-1" />
   <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-200 dark:bg-amber-900/50" />
   <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-300 dark:bg-amber-700/60" />
   <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-500 dark:bg-amber-600/80" />
   <div className="w-[13px] h-[13px] rounded-[3px] bg-amber-700 dark:bg-amber-500" />
   <span>{t('heatmap_more')}</span>
  </div>
  )}
 </div>
 );
}

export default React.memo(StreakCalendarInner);
