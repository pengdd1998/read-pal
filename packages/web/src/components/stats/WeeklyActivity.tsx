'use client';

import { useTranslations, useLocale } from 'next-intl';
import { getDayName } from '@/lib/stats-utils';

interface WeeklyActivityProps {
  weekly: { day: string; pages: number }[];
}

export function WeeklyActivity({ weekly }: WeeklyActivityProps) {
  const t = useTranslations('stats');
  const locale = useLocale();

  if (weekly.length === 0) return null;

  const maxPages = Math.max(...weekly.map((d) => d.pages), 1);

  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('weekly_activity')}</h2>
      <div className="flex items-end gap-2 h-32" role="img" aria-label="Weekly reading activity bar chart">
        {weekly.map((day, i) => {
          const height = Math.max(4, (day.pages / maxPages) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{day.pages}</span>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t-sm relative" style={{ height: '100%' }}>
                <div
                  className="absolute bottom-0 w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-sm transition-all duration-500"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{getDayName(day.day, locale)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
