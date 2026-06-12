'use client';

import { useState, memo } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface CalendarDay {
 date: string;
 pages: number;
 minutes: number;
}

type ActivityLevel = 0 | 1 | 2 | 3 | 4;

function getActivityLevel(pages: number, minutes: number): ActivityLevel {
 if (pages === 0 && minutes === 0) return 0;
 if (pages >= 40 || minutes >= 60) return 4;
 if (pages >= 20 || minutes >= 30) return 3;
 if (pages >= 10 || minutes >= 15) return 2;
 return 1;
}

const LEVEL_COLORS: Record<ActivityLevel, string> = {
 0: 'bg-surface-1',
 1: 'bg-amber-200 dark:bg-amber-900/50',
 2: 'bg-amber-300 dark:bg-amber-700/60',
 3: 'bg-amber-500 dark:bg-amber-600/80',
 4: 'bg-amber-700 dark:bg-amber-500',
};

const HOVER_COLORS: Record<ActivityLevel, string> = {
 0: 'hover:bg-surface-2',
 1: 'hover:bg-amber-300 dark:hover:bg-amber-800/60',
 2: 'hover:bg-amber-400 dark:hover:bg-amber-600/70',
 3: 'hover:bg-amber-600 dark:hover:bg-amber-500/90',
 4: 'hover:bg-amber-800 dark:hover:bg-amber-400',
};

function formatTooltipDate(dateStr: string, locale?: string): string {
 const [y, m, d] = dateStr.split('-').map(Number);
 const date = new Date(y, m - 1, d);
 return date.toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const DayCell = memo(function DayCell({
 day,
 isToday,
}: {
 day: CalendarDay | null;
 isToday: boolean;
}) {
 const [showTooltip, setShowTooltip] = useState(false);
 const t = useTranslations('stats');
 const locale = useLocale();

 if (!day) {
 return <div className="w-[13px] h-[13px] rounded-[3px]" />;
 }

 const level = getActivityLevel(day.pages, day.minutes);
 const todayRing = isToday ? 'ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-gray-900' : '';

 return (
 <div className="relative">
  <div
  className={`w-[13px] h-[13px] rounded-[3px] transition-colors duration-100 cursor-default ${LEVEL_COLORS[level]} ${HOVER_COLORS[level]} ${todayRing}`}
  onMouseEnter={() => setShowTooltip(true)}
  onMouseLeave={() => setShowTooltip(false)}
  />
  {showTooltip && (
  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[11px] rounded-md whitespace-nowrap shadow-lg pointer-events-none">
   {formatTooltipDate(day.date, locale)}
   {level > 0 && (
   <span className="ml-1 text-gray-300 dark:text-gray-600">
    {t('day_tooltip_format', { pages: day.pages, minutes: day.minutes })}
   </span>
   )}
   <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-[3px] border-transparent border-t-gray-900 dark:border-t-gray-100" />
  </div>
  )}
 </div>
 );
});

export const SkeletonHeatmap = memo(function SkeletonHeatmap() {
 return (
 <div className="space-y-[3px]">
  {Array.from({ length: 7 }).map((_, row) => (
  <div key={row} className="flex gap-[3px]">
   {Array.from({ length: 26 }).map((_, col) => (
   <div key={col} className="w-[13px] h-[13px] rounded-[3px] bg-surface-1 animate-pulse" />
   ))}
  </div>
  ))}
 </div>
 );
});