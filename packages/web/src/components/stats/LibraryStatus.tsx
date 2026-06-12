'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ReadingStats } from './types';

interface LibraryStatusProps {
 stats: ReadingStats | undefined;
 statusCounts: { unread: number; reading: number; completed: number };
}

export const LibraryStatus = React.memo(function LibraryStatus({ stats, statusCounts }: LibraryStatusProps) {
 const t = useTranslations('stats');
 const total = statusCounts.reading + statusCounts.unread + statusCounts.completed;

 const items = useMemo(() => [
 { label: t('status_reading'), count: statusCounts.reading, color: 'bg-amber-500', pct: stats?.booksRead ? (statusCounts.reading / total) * 100 : 0 },
 { label: t('status_completed'), count: statusCounts.completed, color: 'bg-emerald-500', pct: stats?.booksRead ? (statusCounts.completed / total) * 100 : 0 },
 { label: t('status_unread'), count: statusCounts.unread, color: 'bg-surface-3', pct: stats?.booksRead ? (statusCounts.unread / total) * 100 : 0 },
 ], [stats, statusCounts, total, t]);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('library_status')}</h2>
  <div className="space-y-3">
  {items.map((item) => (
   <div key={item.label} className="flex items-center gap-3">
   <span className="text-sm text-gray-600 dark:text-gray-300 w-24">{item.label}</span>
   <div className="flex-1 h-3 bg-surface-1 rounded-full overflow-hidden">
    <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(2, item.pct)}%` }} />
   </div>
   <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 w-8 text-right">{item.count}</span>
   </div>
  ))}
  </div>
 </div>
 );
});
