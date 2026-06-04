'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';

interface ReadingPlanPanelProps {
  bookId: string;
  bookTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PlanData {
  planText: string;
  totalDays: number;
  currentDay: number;
  isActive: boolean;
}

export function ReadingPlanPanel({
  bookId,
  bookTitle,
  isOpen,
  onClose,
}: ReadingPlanPanelProps) {
  const { toast } = useToast();
  const t = useTranslations('reader');
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [totalDays, setTotalDays] = useState(14);
  const [dailyMinutes, setDailyMinutes] = useState(30);

  const fetchPlan = useCallback(async () => {
    if (!bookId) return;
    setLoading(true);
    try {
      const res = await api.get<PlanData>('/api/agent/reading-plan', { bookId });
      if (res.success && res.data) {
        setPlan(res.data);
      } else {
        setPlan(null);
      }
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (isOpen && bookId) fetchPlan();
  }, [isOpen, bookId, fetchPlan]);

  const handleGenerate = async () => {
    if (!bookId) return;
    setGenerating(true);
    try {
      const res = await api.post<PlanData>('/api/agent/reading-plan', {
        bookId,
        totalDays,
        dailyMinutes,
      });
      if (res.success && res.data) {
        setPlan(res.data);
        toast(t('reading_plan_generated'), 'success');
      } else {
        toast(res.error?.message || t('reading_plan_error'), 'error');
      }
    } catch {
      toast(t('reading_plan_error'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleAdvance = async () => {
    if (!bookId) return;
    try {
      const res = await api.post<{ message: string }>('/api/agent/reading-plan/advance', { bookId });
      if (res.success) {
        await fetchPlan();
        toast(t('reading_plan_day_complete'), 'success');
      }
    } catch {
      toast(t('reading_plan_error'), 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-80 sm:w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col shadow-xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {t('reading_plan_title')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('close_label')}
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
            </div>
          ) : plan ? (
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min((plan.currentDay / plan.totalDays) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {plan.currentDay}/{plan.totalDays} {t('reading_plan_days')}
                </span>
              </div>

              {/* Plan text */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 font-sans leading-relaxed bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                  {plan.planText}
                </pre>
              </div>

              {/* Actions */}
              {plan.isActive && plan.currentDay < plan.totalDays && (
                <button
                  onClick={handleAdvance}
                  className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-teal-500 text-white hover:bg-teal-600 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          ) : (
            /* Generate form */
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('reading_plan_no_plan')}
              </p>

              <div>
                <label htmlFor="reading-plan-days" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('reading_plan_total_days')}
                </label>
                <input
                  id="reading-plan-days"
                  type="number"
                  value={totalDays}
                  onChange={(e) => setTotalDays(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={90}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                />
              </div>

              <div>
                <label htmlFor="reading-plan-minutes" className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('reading_plan_daily_minutes')}
                </label>
                <input
                  id="reading-plan-minutes"
                  type="number"
                  value={dailyMinutes}
                  onChange={(e) => setDailyMinutes(Math.max(10, Math.min(240, parseInt(e.target.value) || 30)))}
                  min={10}
                  max={240}
                  className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    {t('reading_plan_generating')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t('reading_plan_generate')}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ReadingPlanPanel;
