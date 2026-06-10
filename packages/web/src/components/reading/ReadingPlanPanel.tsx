'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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

export const ReadingPlanPanel = React.memo(function ReadingPlanPanel({
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
 const [error, setError] = useState<string | null>(null);
 const mountedRef = useRef(true);

 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const handleBackdropKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);

 const fetchPlan = useCallback(async () => {
 if (!bookId) return;
 setLoading(true);
 setError(null);
 try {
  const res = await api.get<PlanData>('/api/agent/reading-plan', { bookId });
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setPlan(res.data);
  } else {
  setPlan(null);
  }
 } catch (e) {
  if (!mountedRef.current) return;
  console.warn('ReadingPlanPanel: failed to fetch reading plan', e);
  setPlan(null);
  toast(t('reading_plan_load_failed'), 'error');
 } finally {
  if (mountedRef.current) setLoading(false);
 }
 }, [bookId]);

 useEffect(() => {
 if (!isOpen || !bookId) return;
 let stale = false;
 const load = async () => {
  setLoading(true);
  try {
  const res = await api.get<PlanData>('/api/agent/reading-plan', { bookId });
  if (stale) return;
  if (res.success && res.data) {
   setPlan(res.data);
  } else {
   setPlan(null);
  }
  } catch (e) {
  if (stale) return;
  console.warn('ReadingPlanPanel: failed to load reading plan on open', e);
  setPlan(null);
  toast(t('reading_plan_load_failed'), 'error');
  } finally {
  if (!stale) setLoading(false);
  }
 };
 load();
 return () => { stale = true; };
 }, [isOpen, bookId]);

 const handleGenerate = async () => {
 if (!bookId) return;
 setGenerating(true);
 setError(null);
 try {
  const res = await api.post<PlanData>('/api/agent/reading-plan', {
  bookId,
  totalDays,
  dailyMinutes,
  });
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setPlan(res.data);
  toast(t('reading_plan_generated'), 'success');
  } else {
  setError(t('reading_plan_error'));
  toast(t('reading_plan_error'), 'error');
  }
 } catch (e) {
  if (!mountedRef.current) return;
  console.warn('ReadingPlanPanel: failed to generate reading plan', e);
  setError(t('reading_plan_error'));
  toast(t('reading_plan_error'), 'error');
 } finally {
  if (mountedRef.current) setGenerating(false);
 }
 };

 const handleAdvance = async () => {
 if (!bookId) return;
 try {
  const res = await api.post<{ message: string }>('/api/agent/reading-plan/advance', { bookId });
  if (!mountedRef.current) return;
  if (res.success) {
  await fetchPlan();
  toast(t('reading_plan_day_complete'), 'success');
  }
 } catch (e) {
  if (!mountedRef.current) return;
  console.warn('ReadingPlanPanel: failed to advance reading plan day', e);
  setError(t('reading_plan_error'));
  toast(t('reading_plan_error'), 'error');
 }
 };

 if (!isOpen) return null;

 return (
 <>
  {/* Backdrop */}
  <div
  className="fixed inset-0 bg-black/20 dark:bg-surface-0/40 z-40"
  onClick={onClose}
  onKeyDown={handleBackdropKey}
  tabIndex={-1}
  role="button"
  aria-label={t('close_label')}
  />

  {/* Panel */}
  <div className="fixed right-0 top-0 h-full w-80 sm:w-96 bg-surface-0 border-l border-surface-3 z-50 flex flex-col shadow-xl animate-slide-in-right">
  {/* Header */}
  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
   <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
   {t('reading_plan_title')}
   </h3>
   <button
   onClick={onClose}
   className="p-1 rounded-lg hover:bg-surface-1 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
   aria-label={t('close_label')}
   >
   <svg aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>

  {/* Content */}
  <div className="flex-1 overflow-y-auto p-4">
   {loading ? (
   <div className="space-y-3">
    <div className="h-4 bg-surface-1 rounded animate-pulse" />
    <div className="h-4 bg-surface-1 rounded w-3/4 animate-pulse" />
    <div className="h-4 bg-surface-1 rounded w-1/2 animate-pulse" />
   </div>
   ) : plan ? (
   <div className="space-y-4">
    {/* Progress */}
    <div className="flex items-center gap-2">
    <div className="flex-1 bg-surface-1 rounded-full h-2">
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
    <pre className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300 font-sans leading-relaxed bg-gray-50/50 dark:bg-gray-800/50 p-3 rounded-lg">
     {plan.planText}
    </pre>
    </div>

    {/* Actions */}
    {plan.isActive && plan.currentDay < plan.totalDays && (
    <button
     onClick={handleAdvance}
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
   ) : (
   /* Generate form */
   <div className="space-y-4">
    {error && (
    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-xs text-red-700 dark:text-red-300 flex items-center justify-between"><span>{error}</span><button onClick={handleGenerate} className="ml-2 font-medium underline hover:no-underline whitespace-nowrap">{t("retry", { defaultValue: "Retry" })}</button></div>
    )}
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
     className="w-full mt-1 px-3 py-2 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800 dark:text-gray-200"
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
     className="w-full mt-1 px-3 py-2 text-sm border border-surface-3 rounded-lg bg-surface-0 text-gray-800 dark:text-gray-200"
    />
    </div>

    <button
    onClick={handleGenerate}
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
   )}
  </div>
  </div>
 </>
 );
});

export default ReadingPlanPanel;
