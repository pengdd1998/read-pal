'use client';

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';
import type { ChallengeItem } from './types';

const ChallengeItemRow = React.memo(function ChallengeItemRow({ c, title, progressLabel }: {
  c: ChallengeItem;
  title: string;
  progressLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <span>{c.icon}</span>
          <span className="font-medium">{title}</span>
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{progressLabel}</span>
      </div>
      <div className="w-full bg-surface-1 rounded-full h-1.5" role="progressbar" aria-valuenow={Math.round(c.percentage)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={`rounded-full h-1.5 transition-all duration-500 ${c.completed ? 'bg-green-500' : 'bg-primary-500'}`}
          style={{ width: `${Math.min(100, c.percentage)}%` }}
        />
      </div>
    </div>
  );
});

export const DashboardChallenges = memo(function DashboardChallenges() {
  const t = useTranslations('dashboard');
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchChallenges = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<{ challenges: ChallengeItem[] }>('/api/challenges')
      .then((res) => {
        if (!cancelled && res.data) {
          setChallenges(res.data.challenges ?? []);
        }
      })
      .catch((err) => { console.warn('DashboardChallenges: fetch failed', err); if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchChallenges(); }, [fetchChallenges]);

  const active = useMemo(() => challenges.filter((c) => !c.completed).slice(0, 4), [challenges]);
  const completedCount = useMemo(() => challenges.filter((c) => c.completed).length, [challenges]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-32 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <SkeletonPulse key={i} className="h-8 w-full" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{t('failed_load_challenges')}</p>
        <button type="button" onClick={fetchChallenges} className="min-h-[44px] inline-flex items-center text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400">{t('retry')}</button>
      </div>
    );
  }
  if (active.length === 0) return null;

  const challengeTitleMap: Record<string, string> = {
    'daily-reading': t('challenge_daily_reading'),
    'weekly-pages': t('challenge_weekly_pages'),
    'highlight-streak': t('challenge_highlight_streak'),
    'book-completion': t('challenge_book_completion'),
    'flashcard-review': t('challenge_flashcard_review'),
    'monthly-books': t('challenge_monthly_books'),
  };
  const unitMap: Record<string, string> = {
    minutes: t('challenge_unit_minutes'),
    pages: t('challenge_unit_pages'),
    days: t('challenge_unit_days'),
    percent: t('challenge_unit_percent'),
    cards: t('challenge_unit_cards'),
    books: t('challenge_unit_books'),
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('challenges_title')}</h3>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('challenges_done', { completed: completedCount, total: completedCount + active.length })}</span>
      </div>
      <div className="space-y-3">
        {active.map((c) => (
          <ChallengeItemRow
            key={c.id}
            c={c}
            title={challengeTitleMap[c.id] ?? c.title}
            progressLabel={t('challenges_progress', { progress: c.progress, target: c.target, unit: unitMap[c.unit] ?? c.unit })}
          />
        ))}
      </div>
    </div>
  );
});
