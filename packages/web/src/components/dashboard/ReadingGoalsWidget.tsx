'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { SkeletonPulse } from './SkeletonPulse';

interface GoalsData {
  goal: number;
  completed: number;
  onTrack: boolean;
  dailyGoalMinutes: number;
  todayMinutes: number;
  dailyOnTrack: boolean;
}

export const ReadingGoalsWidget = memo(function ReadingGoalsWidget() {
  const t = useTranslations('dashboard');
  const [goals, setGoals] = useState<GoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchGoals = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.get<GoalsData>('/api/settings/reading-goals')
      .then((res) => {
        if (!cancelled && res.data) setGoals(res.data);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return fetchGoals(); }, [fetchGoals]);

  if (loading) {
    return (
      <div className="card">
        <SkeletonPulse className="h-4 w-28 mb-3" />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonPulse className="h-16 w-full" />
          <SkeletonPulse className="h-16 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-gray-400 mb-2">{t('failed_load_goals')}</p>
        <button onClick={fetchGoals} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">{t('retry')}</button>
      </div>
    );
  }

  if (!goals) return null;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('reading_goals_title')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-center gap-1">
            {goals.onTrack ? (
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            )}
            <span className="text-lg font-bold text-gray-900 dark:text-white">{goals.completed}/{goals.goal}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{t('books_this_week')}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-center gap-1">
            {goals.dailyOnTrack ? (
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            ) : (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
            )}
            <span className="text-lg font-bold text-gray-900 dark:text-white">{goals.todayMinutes}/{goals.dailyGoalMinutes}m</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{t('reading_today')}</p>
        </div>
      </div>
    </div>
  );
});
