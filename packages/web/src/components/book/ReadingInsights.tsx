'use client';

import React, { useMemo } from 'react';
import { parseUTCDate } from '@/lib/date';
import type { ReadingLogEntry } from '@/types/book';

interface ReadingInsightsProps {
 readingLog: ReadingLogEntry[];
 t: (key: string, params?: Record<string, string | number>) => string;
 locale?: string;
}

export const ReadingInsights = React.memo(function ReadingInsights({ readingLog, t, locale }: ReadingInsightsProps) {
 const { totalPagesRead, avgSessionMins, totalMins, bestSession, avgWpm } = useMemo(() => {
 if (readingLog.length === 0) return { totalPagesRead: 0, avgSessionMins: 0, totalMins: 0, bestSession: null as ReadingLogEntry | null, avgWpm: 0 };
 const totalDuration = readingLog.reduce((sum, e) => sum + e.duration, 0);
 const totalPagesRead = readingLog.reduce((sum, e) => sum + e.pagesRead, 0);
 const avgSessionMins = Math.round(totalDuration / readingLog.length / 60);
 const totalMins = Math.round(totalDuration / 60);
 const bestSession = readingLog.reduce(
  (best, e) => (e.pagesRead > best.pagesRead ? e : best),
  readingLog[0],
 );
 const avgWpm =
  totalPagesRead > 0 && totalMins > 0
  ? Math.round((totalPagesRead * 250) / totalMins)
  : 0;
 return { totalDuration, totalPagesRead, avgSessionMins, totalMins, bestSession, avgWpm };
 }, [readingLog]);

 if (readingLog.length === 0) return null;

 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 mb-6 animate-slide-up stagger-4 overflow-hidden">
  <div className="px-5 py-4 border-b border-surface-2">
  <div className="flex items-center gap-2">
   <svg aria-hidden="true"
   className="w-4 h-4 text-purple-500"
   fill="none"
   viewBox="0 0 24 24"
   stroke="currentColor"
   strokeWidth={2}
   >
   <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
   />
   </svg>
   <h2 className="font-semibold">{t('readingInsights')}</h2>
  </div>
  </div>

  {/* Insight cards */}
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-surface-1">
  {[
   {
   label: t('sessions'),
   value: readingLog.length,
   sub: t('avgSession', { count: avgSessionMins }),
   },
   {
   label: t('time'),
   value:
    totalMins >= 60
    ? t('timeHm', { hours: Math.floor(totalMins / 60), mins: totalMins % 60 })
    : t('timeM', { mins: totalMins }),
   sub: t('pages', { count: totalPagesRead }),
   },
   {
   label: t('speed'),
   value: avgWpm > 0 ? `${avgWpm}` : '--',
   sub: avgWpm > 0 ? t('wordsMin') : t('needMoreData'),
   },
   {
   label: t('best'),
   value: bestSession?.pagesRead ?? 0,
   sub: t('pagesInOneSession'),
   },
  ].map((item) => (
   <div key={item.label} className="bg-surface-0 p-3 text-center">
   <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
    {item.value}
   </div>
   <div className="text-[10px] text-gray-500 dark:text-gray-400">{item.label}</div>
   <div className="text-[9px] text-gray-500 dark:text-gray-400 mt-0.5">{item.sub}</div>
   </div>
  ))}
  </div>

  {/* Session list */}
  <div className="divide-y divide-surface-2 max-h-64 overflow-y-auto">
  {readingLog.map((entry) => (
   <SessionEntryItem key={entry.id} entry={entry} t={t} locale={locale} />
  ))}
  </div>
 </div>
 );
});

interface SessionEntryItemProps {
 entry: ReadingLogEntry;
 t: (key: string, params?: Record<string, string | number>) => string;
 locale?: string;
}

const SessionEntryItem = React.memo(function SessionEntryItem({
 entry,
 t,
 locale,
}: SessionEntryItemProps) {
 const date = parseUTCDate(entry.startedAt);
 const dateStr = date.toLocaleDateString(locale, {
 month: 'short',
 day: 'numeric',
 });
 const timeStr = date.toLocaleTimeString(locale, {
 hour: 'numeric',
 minute: '2-digit',
 });
 const mins = Math.round(entry.duration / 60);

 return (
 <div
  className="flex items-start gap-3 px-5 py-3 hover:bg-surface-1 transition-colors"
 >
 <div className="text-xs text-gray-500 dark:text-gray-400 min-w-[52px] pt-0.5">
  <div>{dateStr}</div>
  <div className="text-[10px]">{timeStr}</div>
 </div>
 <div className="flex-1 min-w-0">
  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
  <span className="font-medium text-gray-700 dark:text-gray-300">
   {t('timeM', { mins })}
  </span>
  {entry.pagesRead > 0 && <span>{entry.pagesRead} {t('unit_pg')}</span>}
  {entry.highlights > 0 && (
  <span className="text-amber-500">{entry.highlights} {t('unit_hl')}</span>
  )}
  {entry.notes > 0 && (
  <span className="text-amber-600">{entry.notes} {t('unit_nt')}</span>
  )}
  </div>
  {entry.summary && (
  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2">
  {entry.summary}
  </p>
  )}
 </div>
 </div>
 );
});
