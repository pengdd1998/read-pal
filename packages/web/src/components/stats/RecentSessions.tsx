'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseUTCDate } from '@/lib/date';
import { formatTime } from '@/lib/stats-utils';
import type { SessionData } from './types';

interface RecentSessionsProps {
 sessions: SessionData[];
}

export const RecentSessions = React.memo(function RecentSessions({ sessions }: RecentSessionsProps) {
 const t = useTranslations('stats');
 const locale = useLocale();

 if (sessions.length === 0) return null;

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('recent_sessions')}</h2>
  <div className="space-y-2">
  {sessions.slice(0, 10).map((session) => (
  <SessionRow key={session.startedAt} session={session} t={t} locale={locale} />
  ))}
  </div>
 </div>
 );
});

interface SessionRowProps {
 session: SessionData;
 t: (key: string, params?: Record<string, string | number>) => string;
 locale: string;
}

const SessionRow = React.memo(function SessionRow({
 session,
 t,
 locale,
}: SessionRowProps) {
 // For sessions without a book title, show date AND time so multiple same-day
 // sessions remain distinguishable. Idle sessions (0 pages, very short) get
 // a muted dot so real reading sessions stand out.
 const isIdle = (session.pagesRead || 0) === 0;
 const label = session.bookTitle || (session.startedAt
   ? parseUTCDate(session.startedAt).toLocaleString(locale, {
     month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
   : '—');
 return (
 <div className="flex items-center gap-3 py-2 border-b border-surface-2 last:border-0">
  <div
   className={'w-2 h-2 rounded-full ' + (isIdle ? 'bg-surface-3' : 'bg-amber-400')}
   aria-hidden="true"
   title={isIdle ? t('idle_session_hint') : undefined}
  />
  <span
   className={'text-sm flex-1 truncate ' + (isIdle
     ? 'text-gray-400 dark:text-gray-500'
     : 'text-gray-600 dark:text-gray-300')}
   title={label}
  >
  {label}
  </span>
  <span className={'text-xs ' + (isIdle
    ? 'text-gray-400 dark:text-gray-500'
    : 'text-gray-500 dark:text-gray-400')}>
  {t('session_pages', { count: session.pagesRead })}
  </span>
  <span className={'text-xs font-medium ' + (isIdle
    ? 'text-gray-400 dark:text-gray-500'
    : 'text-amber-600 dark:text-amber-400')}>
  {formatTime(Math.round(session.duration / 60), t)}
  </span>
 </div>
 );
});
