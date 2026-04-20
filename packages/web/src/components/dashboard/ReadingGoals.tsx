'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

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

interface ProgressRingProps {
  value: number;
  max: number;
  size: number;
  strokeWidth: number;
  color: string;
  bgColor: string;
  children: React.ReactNode;
}

function ProgressRing({
  value,
  max,
  size,
  strokeWidth,
  color,
  bgColor,
  children,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / max, 1);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimatedProgress(progress);
    });
    return () => cancelAnimationFrame(timer);
  }, [progress]);

  const dashOffset = circumference * (1 - animatedProgress);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        role="img"
        aria-label={`Daily goal: ${value} of ${max} minutes`}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function ReadingGoals() {
  const t = useTranslations('dashboard');
  const [data, setData] = useState<ReadingGoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [pendingMinutes, setPendingMinutes] = useState(30);
  const [saving, setSaving] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await api.get<ReadingGoalsData>('/api/settings/reading-goals');
      if (res.success && res.data) {
        setData(res.data);
        setPendingMinutes((res.data).dailyGoalMinutes);
      }
    } catch {
      setError(t('goals_failed_load'));
    } finally {
      setLoading(false);
    }
  }, []);

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
    } catch {
      // Keep editor open on failure so user can retry
    } finally {
      setSaving(false);
    }
  };

  const adjustMinutes = (delta: number) => {
    setPendingMinutes((prev) => Math.max(10, Math.min(120, prev + delta)));
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-5 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="flex justify-center gap-10">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3">
              <div className="w-28 h-28 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
              <div className="h-4 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="font-bold text-gray-900 dark:text-white">{t('goals_title')}</h3>
        </div>
        <p className="text-sm text-gray-500">{error ?? t('goals_no_data')}</p>
      </div>
    );
  }

  const dailyComplete = data.todayMinutes >= data.dailyGoalMinutes;
  const weeklyComplete = data.completed >= data.goal;

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="font-bold text-gray-900 dark:text-white">{t('goals_title')}</h3>
      </div>

      {/* Progress Rings */}
      <div className="flex justify-center gap-8 sm:gap-12">
        {/* Daily Goal */}
        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            value={data.todayMinutes}
            max={data.dailyGoalMinutes}
            size={112}
            strokeWidth={8}
            color={dailyComplete ? '#10b981' : '#f59e0b'}
            bgColor="currentColor"
          >
            <div className="text-center">
              <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                {data.todayMinutes}
              </span>
              <span className="text-xs text-gray-400">/{data.dailyGoalMinutes}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">{t('goals_min_today')}</div>
            </div>
          </ProgressRing>
          <p className="text-xs font-medium text-center">
            {dailyComplete ? (
              <span className="text-emerald-600 dark:text-emerald-400">{t('goals_reached')}</span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">
                {t('goals_min_to_go', { count: data.dailyRemaining })}
              </span>
            )}
          </p>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {t('goals_daily')}
          </span>
        </div>

        {/* Weekly Goal */}
        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            value={data.completed}
            max={data.goal}
            size={112}
            strokeWidth={8}
            color={weeklyComplete ? '#10b981' : '#14b8a6'}
            bgColor="currentColor"
          >
            <div className="text-center">
              <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                {data.completed}
              </span>
              <span className="text-xs text-gray-400">/{data.goal}</span>
              <div className="text-[10px] text-gray-500 mt-0.5">{t('goals_books_this_week')}</div>
            </div>
          </ProgressRing>
          <p className="text-xs font-medium text-center">
            {weeklyComplete ? (
              <span className="text-emerald-600 dark:text-emerald-400">{t('goals_reached')}</span>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">
                {t('goals_books_to_go', { count: data.remaining })}
              </span>
            )}
          </p>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
            {t('goals_weekly')}
          </span>
        </div>
      </div>

      {/* In-progress count */}
      {data.inProgress > 0 && (
        <p className="text-center text-xs text-gray-400 mt-4">
          {t('goals_books_in_progress', { count: data.inProgress })}
        </p>
      )}

      {/* Settings */}
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
        {!editingGoal ? (
          <button
            onClick={() => {
              setPendingMinutes(data.dailyGoalMinutes);
              setEditingGoal(true);
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mx-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {t('goals_change_daily', { minutes: data.dailyGoalMinutes })}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('goals_daily_reading_goal')}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjustMinutes(-5)}
                disabled={pendingMinutes <= 10 || saving}
                className="w-11 h-11 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
              </button>
              <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums w-14 text-center">
                {pendingMinutes}
              </span>
              <button
                onClick={() => adjustMinutes(5)}
                disabled={pendingMinutes >= 120 || saving}
                className="w-11 h-11 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveGoal}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? t('goals_saving') : t('goals_save')}
              </button>
              <button
                onClick={() => setEditingGoal(false)}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('goals_cancel')}
              </button>
            </div>
            <p className="text-[10px] text-gray-400">{t('goals_range_hint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
