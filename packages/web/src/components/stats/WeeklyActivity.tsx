'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { getDayName } from '@/lib/stats-utils';

interface WeeklyBarProps {
 day: { day: string; pages: number };
 maxPages: number;
 locale: string;
}

const WeeklyBar = React.memo(function WeeklyBar({ day, maxPages, locale }: WeeklyBarProps) {
 const height = Math.max(4, (day.pages / maxPages) * 100);
 return (
 <div className="flex-1 flex flex-col items-center gap-1">
  <span className="text-[10px] font-medium text-gray-500">{day.pages}</span>
  <div className="w-full bg-surface-1 rounded-t-sm relative" style={{ height: '100%' }}>
  <div
   className="absolute bottom-0 w-full bg-gradient-to-t from-amber-500 to-amber-400 rounded-t-sm transition-all duration-500"
   style={{ height: `${height}%` }}
  />
  </div>
  <span className="text-[10px] text-gray-500">{getDayName(day.day, locale)}</span>
 </div>
 );
});

interface WeeklyActivityProps {
 weekly: { day: string; pages: number }[];
}

export const WeeklyActivity = React.memo(function WeeklyActivity({ weekly }: WeeklyActivityProps) {
 const t = useTranslations('stats');
 const locale = useLocale();

 if (weekly.length === 0) return null;

 const maxPages = Math.max(...weekly.map((d) => d.pages), 1);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 mb-4">{t('weekly_activity')}</h2>
  <div className="flex items-end gap-2 h-32" role="img" aria-label={t('weekly_activity_chart')}>
  {weekly.map((day) => (
   <WeeklyBar key={day.day} day={day} maxPages={maxPages} locale={locale} />
  ))}
  </div>
 </div>
 );
});
