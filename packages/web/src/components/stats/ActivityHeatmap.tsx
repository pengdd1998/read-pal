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
 // Aggregate pages by UTC date so the heatmap matches backend-aggregated
 // stats (which sum pages_read per `func.date(started_at)` bucket on
 // naive-UTC columns). Multiple sessions on the same day must add up;
 // previously Map.set overwrote and only the last session per day was kept.
 const pagesByDay = new Map<string, number>();
 for (const s of sessions) {
  const d = parseUTCDate(s.startedAt);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  pagesByDay.set(key, (pagesByDay.get(key) ?? 0) + s.pagesRead);
 }

 const result = [];
 const todayUTC = new Date();
 for (let i = 0; i < DAYS; i++) {
  const date = new Date(todayUTC);
  date.setUTCDate(date.getUTCDate() - (DAYS - 1 - i));
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const pages = pagesByDay.get(key);
  const level = pages
  ? pages > 10 ? 3
   : pages > 5 ? 2
   : 1
  : 0;
  result.push(
  <div
   key={key}
   className={`w-3 h-3 rounded-sm ${COLORS[level]}`}
   title={`${date.toLocaleDateString(locale)} - ${pages ? t('heatmap_title', { count: pages }) : t('heatmap_no_activity')}`}
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
