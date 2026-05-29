'use client';

import { useTranslations } from 'next-intl';
import type { SessionData } from './types';

interface ActivityHeatmapProps {
  sessions: SessionData[];
}

export function ActivityHeatmap({ sessions }: ActivityHeatmapProps) {
  const t = useTranslations('stats');
  const days = 84;

  const cells = [];
  for (let i = 0; i < days; i++) {
    const dayActivity = sessions.find((s) => {
      const sessionDate = new Date(s.date);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - (days - 1 - i));
      return sessionDate.toDateString() === targetDate.toDateString();
    });
    const level = dayActivity
      ? dayActivity.pagesRead > 10 ? 3
        : dayActivity.pagesRead > 5 ? 2
          : 1
      : 0;
    const colors = [
      'bg-gray-100 dark:bg-gray-800',
      'bg-amber-200 dark:bg-amber-800',
      'bg-amber-400 dark:bg-amber-600',
      'bg-amber-600 dark:bg-amber-400',
    ];
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    cells.push(
      <div
        key={i}
        className={`w-3 h-3 rounded-sm ${colors[level]}`}
        title={`${date.toLocaleDateString()} - ${dayActivity ? t('heatmap_title', { count: dayActivity.pagesRead }) : t('heatmap_no_activity')}`}
      />,
    );
  }

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
