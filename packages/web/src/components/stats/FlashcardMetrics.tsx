'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { FlashcardStats } from './types';

interface FlashcardMetricsProps {
  flashcardStats: FlashcardStats;
}

const MetricCard = React.memo(function MetricCard({ value, label, sub, color, bg }: {
  value: string | number;
  label: string;
  sub: string | null;
  color: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-3 text-center`}>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
});

export const FlashcardMetrics = React.memo(function FlashcardMetrics({ flashcardStats }: FlashcardMetricsProps) {
  const t = useTranslations('stats');

  if (flashcardStats.totalCards === 0) return null;

  const metrics = [
    { label: t('flashcards_total_cards'), value: flashcardStats.totalCards, sub: `${flashcardStats.reviewedCards} ${t('flashcards_reviewed')}`, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
    { label: t('flashcards_due_today'), value: flashcardStats.dueToday, sub: null, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10' },
    { label: t('flashcards_accuracy'), value: `${flashcardStats.accuracy}%`, sub: null, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10' },
  ];

  return (
    <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
      <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('flashcards_title')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {metrics.map((item) => (
          <MetricCard
            key={item.label}
            value={item.value}
            label={item.label}
            sub={item.sub}
            color={item.color}
            bg={item.bg}
          />
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-gray-600 dark:text-gray-300">{t('flashcards_retention')}</span>
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{flashcardStats.retentionRate}%</span>
        </div>
        <div className="h-2.5 bg-surface-1 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, flashcardStats.retentionRate)}%` }}
          />
        </div>
      </div>
    </div>
  );
});
