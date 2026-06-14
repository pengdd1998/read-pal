'use client';

import React, { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { warn } from '@/lib/logger';
import {
  PlanLoadingSkeleton,
  PlanProgressView,
  PlanGenerateForm,
} from './ReadingPlanPanel.subcomponents';
import type { PlanData } from './ReadingPlanPanel.subcomponents';

interface ReadingPlanPanelProps {
  bookId: string;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Plan state machine: one status field replaces the three independent booleans
// (loading/generating/advancing) so concurrent transitions can't leave two
// flags true at once. Error and plan live alongside so they reset atomically.
// ---------------------------------------------------------------------------

type PlanStatus = 'idle' | 'loading' | 'generating' | 'advancing';

type PlanState = {
  status: PlanStatus;
  plan: PlanData | null;
  error: string | null;
};

type PlanAction =
  | { type: 'fetch_start' }
  | { type: 'generate_start' }
  | { type: 'advance_start' }
  | { type: 'plan_loaded'; plan: PlanData | null; error?: string }
  | { type: 'fail'; error: string };

const initialPlanState: PlanState = { status: 'idle', plan: null, error: null };

function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case 'fetch_start':
     return { status: 'loading', plan: null, error: null };
    case 'generate_start':
     return { ...state, status: 'generating', error: null };
    case 'advance_start':
     return { ...state, status: 'advancing', error: null };
    case 'plan_loaded':
     return { status: 'idle', plan: action.plan, error: action.error ?? null };
    case 'fail':
     return { ...state, status: 'idle', error: action.error };
    default:
     return state;
  }
}

export const ReadingPlanPanel = React.memo(function ReadingPlanPanel({
  bookId,
  isOpen,
  onClose,
}: ReadingPlanPanelProps) {
  const { toast } = useToast();
  const t = useTranslations('reader');
  const [state, dispatch] = useReducer(planReducer, initialPlanState);
  const [totalDays, setTotalDays] = useState(14);
  const [dailyMinutes, setDailyMinutes] = useState(30);
  const mountedRef = useRef(true);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleBackdropKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);

  const fetchPlan = useCallback(async (signal?: AbortSignal) => {
    if (!bookId) return;
    dispatch({ type: 'fetch_start' });
    try {
      const res = await api.get<PlanData>('/api/agent/reading-plan', { bookId });
      if (signal?.aborted || !mountedRef.current) return;
      if (res.success && res.data) {
        dispatch({ type: 'plan_loaded', plan: res.data });
      } else {
        dispatch({ type: 'plan_loaded', plan: null });
      }
    } catch (e) {
      if (signal?.aborted || !mountedRef.current) return;
      warn('ReadingPlanPanel: failed to fetch reading plan', e);
      dispatch({ type: 'plan_loaded', plan: null });
      toast(t('reading_plan_load_failed'), 'error');
    }
  }, [bookId, toast, t]);

  useEffect(() => {
    if (!isOpen || !bookId) return;
    const ac = new AbortController();
    fetchPlan(ac.signal);
    return () => { ac.abort(); };
  }, [isOpen, bookId, fetchPlan]);

  const handleGenerate = async () => {
    if (!bookId) return;
    dispatch({ type: 'generate_start' });
    try {
      const res = await api.post<PlanData>('/api/agent/reading-plan', {
        bookId,
        totalDays,
        dailyMinutes,
      });
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        dispatch({ type: 'plan_loaded', plan: res.data });
        toast(t('reading_plan_generated'), 'success');
      } else {
        dispatch({ type: 'fail', error: t('reading_plan_error') });
        toast(t('reading_plan_error'), 'error');
      }
    } catch (e) {
      if (!mountedRef.current) return;
      warn('ReadingPlanPanel: failed to generate reading plan', e);
      dispatch({ type: 'fail', error: t('reading_plan_error') });
      toast(t('reading_plan_error'), 'error');
    }
  };

  const handleAdvance = async () => {
    if (!bookId || state.status === 'advancing') return;
    dispatch({ type: 'advance_start' });
    try {
      const res = await api.post<{ message: string }>('/api/agent/reading-plan/advance', { bookId });
      if (!mountedRef.current) return;
      if (res.success) {
        // Silent refresh — keep plan visible while we re-fetch so the user
        // doesn't see a skeleton flash between advance and refetch.
        try {
          const planRes = await api.get<PlanData>('/api/agent/reading-plan', { bookId });
          if (!mountedRef.current) return;
          if (planRes.success && planRes.data) {
            dispatch({ type: 'plan_loaded', plan: planRes.data });
          } else {
            dispatch({ type: 'plan_loaded', plan: null });
          }
        } catch (e) {
          if (!mountedRef.current) return;
          warn('ReadingPlanPanel: failed to refetch after advance', e);
          // Don't dispatch fail — advance succeeded, the refetch is best-effort
          dispatch({ type: 'plan_loaded', plan: null });
        }
        toast(t('reading_plan_day_complete'), 'success');
      } else {
        dispatch({ type: 'fail', error: t('reading_plan_error') });
        toast(t('reading_plan_error'), 'error');
      }
    } catch (e) {
      if (!mountedRef.current) return;
      warn('ReadingPlanPanel: failed to advance reading plan day', e);
      dispatch({ type: 'fail', error: t('reading_plan_error') });
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
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-1 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
            aria-label={t('close_label')}
          >
            <svg aria-hidden="true" className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {state.status === 'loading' ? (
            <PlanLoadingSkeleton />
          ) : state.plan ? (
            <PlanProgressView plan={state.plan} onAdvance={handleAdvance} advancing={state.status === 'advancing'} />
          ) : (
            <PlanGenerateForm
              error={state.error}
              generating={state.status === 'generating'}
              totalDays={totalDays}
              dailyMinutes={dailyMinutes}
              onTotalDaysChange={setTotalDays}
              onDailyMinutesChange={setDailyMinutes}
              onGenerate={handleGenerate}
            />
          )}
        </div>
      </div>
    </>
  );
});

export default ReadingPlanPanel;
