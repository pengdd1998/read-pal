'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface PlanData {
  planText: string;
  totalDays: number;
  currentDay: number;
  isActive: boolean;
}

export const PlanLoadingSkeleton = React.memo(function PlanLoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 bg-surface-1 rounded animate-pulse" />
      <div className="h-4 bg-surface-1 rounded w-3/4 animate-pulse" />
      <div className="h-4 bg-surface-1 rounded w-1/2 animate-pulse" />
    </div>
  );
});

interface PlanProgressViewProps {
  plan: PlanData;
  onAdvance: () => void;
}

export const PlanProgressView = React.memo(function PlanProgressView({
  plan,
  onAdvance,
}: PlanProgressViewProps) {
  const t = useTranslations('reader');

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-surface-1 rounded-full h-2">
          <div
            className="bg-amber-500 h-2 rounded-full transition-all"
            style={{ width: `${Math.min((plan.currentDay / plan.totalDays) * 100, 100)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {plan.currentDay}/{plan.totalDays} {t('reading_plan_days')}
        </span>
      </div>

      {/* Plan text */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <pre className="whitespace-pre-wrap text-xs text-gray-700 font-sans leading-relaxed bg-gray-50/50 p-3 rounded-lg">
          {plan.planText}
        </pre>
      </div>

      {/* Actions */}
      {plan.isActive && plan.currentDay < plan.totalDays && (
        <button
          type="button"
          onClick={onAdvance}
          className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {t('reading_plan_mark_complete')}
        </button>
      )}

      {plan.currentDay >= plan.totalDays && (
        <div className="text-center py-2 text-sm text-teal-600 dark:text-teal-400">
          {t('reading_plan_completed')}
        </div>
      )}
    </div>
  );
});

interface PlanGenerateFormProps {
  error: string | null;
  generating: boolean;
  totalDays: number;
  dailyMinutes: number;
  onTotalDaysChange: (days: number) => void;
  onDailyMinutesChange: (minutes: number) => void;
  onGenerate: () => void;
}

export const PlanGenerateForm = React.memo(function PlanGenerateForm({
  error,
  generating,
  totalDays,
  dailyMinutes,
  onTotalDaysChange,
  onDailyMinutesChange,
  onGenerate,
}: PlanGenerateFormProps) {
  const t = useTranslations('reader');

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={onGenerate}
            className="ml-2 font-medium underline hover:no-underline whitespace-nowrap focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
          >
            {t('retry')}
          </button>
        </div>
      )}
      <p className="text-sm text-gray-600">
        {t('reading_plan_no_plan')}
      </p>

      <div>
        <label htmlFor="reading-plan-days" className="text-xs font-medium text-gray-500">
          {t('reading_plan_total_days')}
        </label>
        <input
          id="reading-plan-days"
          type="number"
          value={totalDays}
          onChange={(e) => onTotalDaysChange(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
          min={1}
          max={90}
          className="w-full mt-1 px-3 py-2 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
        />
      </div>

      <div>
        <label htmlFor="reading-plan-minutes" className="text-xs font-medium text-gray-500">
          {t('reading_plan_daily_minutes')}
        </label>
        <input
          id="reading-plan-minutes"
          type="number"
          value={dailyMinutes}
          onChange={(e) => onDailyMinutesChange(Math.max(10, Math.min(240, parseInt(e.target.value) || 30)))}
          min={10}
          max={240}
          className="w-full mt-1 px-3 py-2 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
        />
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {generating ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            {t('reading_plan_generating')}
          </>
        ) : (
          <>
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('reading_plan_generate')}
          </>
        )}
      </button>
    </div>
  );
});

export type { PlanData, PlanProgressViewProps, PlanGenerateFormProps };
