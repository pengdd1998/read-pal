'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { ProgressRing } from './ProgressRing';

interface ReadingGoalsData {
 goal: number;
 completed: number;
 inProgress: number;
 onTrack: boolean;
 remaining: number;
 dailyGoalMinutes: number;
 todayMinutes: number;
 dailyOnTrack: boolean;
 dailyRemaining: number;
}

export const ReadingGoals = React.memo(function ReadingGoals() {
 const t = useTranslations('dashboard');
 const [data, setData] = useState<ReadingGoalsData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [editingGoal, setEditingGoal] = useState(false);
 const [pendingMinutes, setPendingMinutes] = useState(30);
 const [saving, setSaving] = useState(false);

 const mountedRef = useRef(true);
 useEffect(() => () => { mountedRef.current = false; }, []);

 const fetchGoals = useCallback(async () => {
 try {
  setLoading(true);
  setError(null);
  const res = await api.get<ReadingGoalsData>('/api/settings/reading-goals');
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setData(res.data);
  setPendingMinutes(res.data.dailyGoalMinutes);
  }
 } catch (err) {
  console.warn('ReadingGoals: fetch failed', err);
  if (!mountedRef.current) return;
  setError(t('goals_failed_load'));
 } finally {
  if (mountedRef.current) setLoading(false);
 }
 }, [t]);

 useEffect(() => {
 fetchGoals();
 }, [fetchGoals]);

 const handleSaveGoal = async () => {
 if (!data || pendingMinutes === data.dailyGoalMinutes) {
  setEditingGoal(false);
  return;
 }
 try {
  setSaving(true);
  await api.patch('/api/settings', { dailyReadingMinutes: pendingMinutes });
  if (!mountedRef.current) return;
  setData((prev) =>
  prev
   ? {
    ...prev,
    dailyGoalMinutes: pendingMinutes,
    dailyRemaining: Math.max(0, pendingMinutes - prev.todayMinutes),
    dailyOnTrack: prev.todayMinutes >= pendingMinutes,
   }
   : prev,
  );
  setEditingGoal(false);
 } catch (err) {
  console.warn('ReadingGoals: failed to save goal', err);
  setError(t('goals_failed_save', { defaultValue: 'Failed to save goal' }));
 } finally {
  setSaving(false);
 }
 };

 const adjustMinutes = (delta: number) => {
 setPendingMinutes((prev) => Math.max(10, Math.min(120, prev + delta)));
 };

 if (loading) {
 return (
  <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6">
  <div className="flex items-center gap-2 mb-6">
   <div className="w-5 h-5 bg-surface-1 rounded animate-pulse" />
   <div className="h-5 w-32 bg-surface-1 rounded animate-pulse" />
  </div>
  <div className="flex justify-center gap-10">
   {Array.from({ length: 2 }).map((_, i) => (
   <div key={i} className="flex flex-col items-center gap-3">
    <div className="w-28 h-28 bg-surface-1 rounded-full animate-pulse" />
    <div className="h-4 w-20 bg-surface-1 rounded animate-pulse" />
   </div>
   ))}
  </div>
  </div>
 );
 }

 if (error || !data) {
 return (
  <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6">
  <div className="flex items-center gap-2 mb-4">
   <svg aria-hidden="true" className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
   </svg>
   <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('goals_title')}</h3>
  </div>
  <p className="text-sm text-gray-500 dark:text-gray-400">{error ?? t('goals_no_data')}</p>
  {error && (
   <button onClick={fetchGoals} className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-amber-400">
    {t('retry')}
   </button>
  )}
  </div>
 );
 }

 const dailyComplete = data.todayMinutes >= data.dailyGoalMinutes;
 const weeklyComplete = data.completed >= data.goal;

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6">
  <div className="flex items-center gap-2 mb-6">
  <svg aria-hidden="true" className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
  <h3 className="font-bold text-gray-900 dark:text-gray-100">{t('goals_title')}</h3>
  </div>

  {/* Progress Rings */}
  <div className="flex justify-center gap-8 sm:gap-12">
  <div className="flex flex-col items-center gap-2">
   <ProgressRing value={data.todayMinutes} max={data.dailyGoalMinutes} size={112} strokeWidth={8}
   color={dailyComplete ? '#10b981' : '#f59e0b'} bgColor="currentColor">
   <div className="text-center">
    <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{data.todayMinutes}</span>
    <span className="text-xs text-gray-400 dark:text-gray-500">/{data.dailyGoalMinutes}</span>
    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t('goals_min_today')}</div>
   </div>
   </ProgressRing>
   <p className="text-xs font-medium text-center">
   {dailyComplete
    ? <span className="text-emerald-600 dark:text-emerald-400">{t('goals_reached')}</span>
    : <span className="text-gray-500 dark:text-gray-400">{t('goals_min_to_go', { count: data.dailyRemaining })}</span>}
   </p>
   <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">{t('goals_daily')}</span>
  </div>

  <div className="flex flex-col items-center gap-2">
   <ProgressRing value={data.completed} max={data.goal} size={112} strokeWidth={8}
   color={weeklyComplete ? '#10b981' : '#14b8a6'} bgColor="currentColor">
   <div className="text-center">
    <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">{data.completed}</span>
    <span className="text-xs text-gray-400 dark:text-gray-500">/{data.goal}</span>
    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t('goals_books_this_week')}</div>
   </div>
   </ProgressRing>
   <p className="text-xs font-medium text-center">
   {weeklyComplete
    ? <span className="text-emerald-600 dark:text-emerald-400">{t('goals_reached')}</span>
    : <span className="text-gray-500 dark:text-gray-400">{t('goals_books_to_go', { count: data.remaining })}</span>}
   </p>
   <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">{t('goals_weekly')}</span>
  </div>
  </div>

  {data.inProgress > 0 && (
  <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
   {t('goals_books_in_progress', { count: data.inProgress })}
  </p>
  )}

  {/* Goal Settings */}
  <div className="mt-5 pt-4 border-t border-surface-2">
  {!editingGoal ? (
   <button onClick={() => { setPendingMinutes(data.dailyGoalMinutes); setEditingGoal(true); }}
   className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mx-auto min-h-[44px] px-3 focus-visible:ring-2 focus-visible:ring-amber-400">
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
   </svg>
   {t('goals_change_daily', { minutes: data.dailyGoalMinutes })}
   </button>
  ) : (
   <div className="flex flex-col items-center gap-3">
   <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('goals_daily_reading_goal')}</p>
   <div className="flex items-center gap-3">
    <button onClick={() => adjustMinutes(-5)} disabled={pendingMinutes <= 10 || saving}
    aria-label={t('goals_decrease_aria')}
    className="w-11 h-11 rounded-lg bg-surface-1 text-gray-600 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
    </button>
    <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums w-14 text-center">{pendingMinutes}</span>
    <button onClick={() => adjustMinutes(5)} disabled={pendingMinutes >= 120 || saving}
    aria-label={t('goals_increase_aria')}
    className="w-11 h-11 rounded-lg bg-surface-1 text-gray-600 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
    </button>
   </div>
   <div className="flex items-center gap-2">
    <button onClick={handleSaveGoal} disabled={saving}
    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2">
    {saving ? t('goals_saving') : t('goals_save')}
    </button>
    <button onClick={() => setEditingGoal(false)} disabled={saving}
    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-1 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2">
    {t('goals_cancel')}
    </button>
   </div>
   <p className="text-[10px] text-gray-400 dark:text-gray-500">{t('goals_range_hint')}</p>
   </div>
  )}
  </div>
 </div>
 );
});
