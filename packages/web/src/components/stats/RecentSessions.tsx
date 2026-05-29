'use client';

import { useTranslations } from 'next-intl';
import { formatTime } from '@/lib/stats-utils';
import type { SessionData } from './types';

interface RecentSessionsProps {
  sessions: SessionData[];
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  const t = useTranslations('stats');

  if (sessions.length === 0) return null;

  return (
    <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('recent_sessions')}</h2>
      <div className="space-y-2">
        {sessions.slice(0, 10).map((session, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">
              {session.date ? new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
            </span>
            <span className="text-xs text-gray-500">
              {t('session_pages', { count: session.pagesRead })}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {formatTime(Math.round(session.duration / 60))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
