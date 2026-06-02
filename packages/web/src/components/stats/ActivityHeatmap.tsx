'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { SessionData } from './types';

interface ActivityHeatmapProps {
  sessions: SessionData[];
}

const DAYS = 84;

const COLORS = [
  'bg-gray-100 dark:bg-gray-800',
  'bg-amber-200 dark:bg-amber-800',
  'bg-amber-400 dark:bg-amber-600',
  'bg-amber-600 dark:bg-amber-400',
];

export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const t = useTranslations('stats');

  const cells = useMemo(() => {
    const sessionMap = new Map<string, SessionData>();
    for (const s of sessions) {
      sessionMap.set(new Date(s.date).toDateString(), s);
    }

    const result = [];
    for (let i = 0; i < DAYS; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (DAYS - 1 - i));
      const dayActivity = sessionMap.get(date.toDateString());
      const level = dayActivity
        ? dayActivity.pagesRead > 10 ? 3
          : dayActivity.pagesRead > 5 ? 2
            : 1
        : 0;
      result.push(
        <div
          key={i}
          className={`w-3 h-3 rounded-sm ${COLORS[level]}`}
          title={`${date.toLocaleDateString()} - ${dayActivity ? t('heatmap_title', { count: dayActivity.pagesRead }) : t('heatmap_no_activity')}`}
        />,
      );
    }
    return result;
  }, [sessions, t]);

  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('activity_title')}</h2>
      <div className="flex flex-wrap gap-1">
        {cells}
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
        <span>{t('heatmap_less')}</span>
        <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
        <div className="w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800" />
        <div className="w-3 h-3 rounded-sm bg-amber-400 dark:bg-amber-600" />
        <div className="w-3 h-3 rounded-sm bg-amber-600 dark:bg-amber-400" />
        <span>{t('heatmap_more')}</span>
      </div>
    </div>
  );
}
