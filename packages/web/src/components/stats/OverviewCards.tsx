'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/stats-utils';
import type { ReadingStats, SessionData } from './types';

interface OverviewCardsProps {
 stats: ReadingStats | undefined;
 sessions: SessionData[];
}

export function OverviewCards({ stats, sessions }: OverviewCardsProps) {
 const t = useTranslations('stats');

 const { totalMinutes, totalPages, cards } = useMemo(() => {
 const totalMinutes = Math.round(sessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60);
 const totalPages = sessions.reduce((acc, s) => acc + (s.pagesRead || 0), 0);
 const cards = [
 { label: t('label_books'), value: stats?.booksRead || 0, icon: '📚', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
 { label: t('label_pages'), value: stats?.pagesRead || totalPages || 0, icon: '📄', color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/10' },
 { label: t('label_streak'), value: t('streak_days', { count: stats?.readingStreak || 0 }), icon: '🔥', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/10' },
 { label: t('label_time'), value: stats?.totalTime || formatTime(totalMinutes, t), icon: '⏱️', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
 ];
 return { totalMinutes, totalPages, cards };
 }, [stats, sessions, t]);

 return (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {cards.map((item, i) => (
  <div key={item.label} className={`stagger-${i + 1} animate-slide-up ${item.bg} rounded-xl p-4 text-center`}>
   <span className="text-2xl">{item.icon}</span>
   <div className={`text-2xl font-bold ${item.color} mt-1`}>{item.value}</div>
   <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
  </div>
  ))}
 </div>
 );
}
