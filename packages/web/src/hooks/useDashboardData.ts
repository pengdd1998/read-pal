'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { DashboardData } from '@/components/dashboard/types';
import type { InsightKey } from '@/components/dashboard/CurrentReadingSection';

const STREAK_MILESTONES: Record<number, string> = {
  3: 'streak_milestone_3',
  7: 'streak_milestone_7',
  14: 'streak_milestone_14',
  30: 'streak_milestone_30',
};

export function useDashboardData() {
  const t = useTranslations('dashboard');
  const { toast } = useToast();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const celebratedMilestones = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    let lastFetchTime = 0;
    const fetchDashboard = () => {
      const now = Date.now();
      if (now - lastFetchTime < 5000) return;
      lastFetchTime = now;
      api.get<DashboardData>('/api/stats/dashboard')
        .then((res) => {
          if (!cancelled) {
            if (res.success) {
              setDashboardData((res.data) ?? null);
            } else {
              setError(t('failed_load'));
            }
          }
        })
        .catch((err) => {
          console.warn('Dashboard: failed to load data', err);
          if (!cancelled) setError(t('failed_load'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    fetchDashboard();
    const onFocus = () => { if (!cancelled) fetchDashboard(); };
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  const stats = dashboardData?.stats ?? null;
  const recentBooks = dashboardData?.recentBooks ?? [];
  const streak = stats?.readingStreak ?? 0;
  const hasData = useMemo(
    () => !loading && (recentBooks.length > 0 || (stats !== null && (stats.booksRead > 0 || stats.pagesRead > 0))),
    [loading, recentBooks, stats],
  );

  // Streak milestone celebrations
  useEffect(() => {
    if (loading || streak === 0) return;
    const msgKey = STREAK_MILESTONES[streak];
    if (msgKey && !celebratedMilestones.current.has(streak)) {
      celebratedMilestones.current.add(streak);
      toast(t(msgKey), 'success', 5000);
    }
  }, [streak, loading, toast, t]);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  return {
    dashboardData,
    stats,
    recentBooks,
    streak,
    hasData,
    loading,
    error,
    retry,
  };
}
