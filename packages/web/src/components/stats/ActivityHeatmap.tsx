'use client';

import React, { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseUTCDate } from '@/lib/date';
import type { SessionData } from './types';

interface ActivityHeatmapProps {
 sessions: SessionData[];
}

const DAYS = 84;

const COLORS = [
 'bg-surface-1',
 'bg-amber-200 dark:bg-amber-800',
 'bg-amber-400 dark:bg-amber-600',
 'bg-amber-600 dark:bg-amber-400',
];

export const ActivityHeatmap = React.memo(function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
 const t = useTranslations('stats');
 const locale = useLocale();

 const cells = useMemo(() => {
 // Bucket sessions by UTC date so the heatmap matches backend-aggregated
 // stats (which group by `func.date(started_at)` on naive-UTC columns).
 // Using local toDateString() here would split sessions across the wrong
 // day for any client whose TZ offset crosses midnight UTC.
 const sessionMap = new Map<string, SessionData>();
 for (const s of sessions) {
  const d = parseUTCDate(s.startedAt);
  // UTC YYYY-MM-DD key — stable across client TZs
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  sessionMap.set(key, s);
 }

 const result = [];
 const todayUTC = new Date();
 for (let i = 0; i < DAYS; i++) {
  const date = new Date(todayUTC);
  date.setUTCDate(date.getUTCDate() - (DAYS - 1 - i));
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const dayActivity = sessionMap.get(key);
  const level = dayActivity
  ? dayActivity.pagesRead > 10 ? 3
   : dayActivity.pagesRead > 5 ? 2
   : 1
  : 0;
  result.push(
  <div
   key={key}
   className={`w-3 h-3 rounded-sm ${COLORS[level]}`}
   title={`${date.toLocaleDateString(locale)} - ${dayActivity ? t('heatmap_title', { count: dayActivity.pagesRead }) : t('heatmap_no_activity')}`}
  />,
  );
 }
 return result;
 }, [sessions, t, locale]);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('activity_title')}</h2>
  <div className="flex flex-wrap gap-1">
  {cells}
  </div>
  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
  <span>{t('heatmap_less')}</span>
  <div className="w-3 h-3 rounded-sm bg-surface-1" />
  <div className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800" />
  <div className="w-3 h-3 rounded-sm bg-amber-400 dark:bg-amber-600" />
  <div className="w-3 h-3 rounded-sm bg-amber-600 dark:bg-amber-400" />
  <span>{t('heatmap_more')}</span>
  </div>
 </div>
 );
});
