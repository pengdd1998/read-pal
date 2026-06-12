'use client';

import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
 return (
 <div className="flex items-center gap-3 py-2 border-b border-surface-2 last:border-0">
  <div className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
  <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 truncate">
  {session.bookTitle || (session.startedAt ? new Date(session.startedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '—')}
  </span>
  <span className="text-xs text-gray-500 dark:text-gray-400">
  {t('session_pages', { count: session.pagesRead })}
  </span>
  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
  {formatTime(Math.round(session.duration / 60), t)}
  </span>
 </div>
 );
});
