'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { SkeletonPulse } from '@/components/dashboard/SkeletonPulse';
import { WelcomeSection } from '@/components/dashboard/WelcomeSection';
import { CurrentReadingSection } from '@/components/dashboard/CurrentReadingSection';
import type { InsightKey } from '@/components/dashboard/CurrentReadingSection';
import { ReadingGoalsWidget } from '@/components/dashboard/ReadingGoalsWidget';
import { WeeklySummaryWidget } from '@/components/dashboard/WeeklySummaryWidget';
import { ReadingSpeedWidget } from '@/components/dashboard/ReadingSpeedWidget';
import { DashboardChallenges } from '@/components/dashboard/DashboardChallenges';
import { DashboardRecommendations } from '@/components/dashboard/DashboardRecommendations';
import { FlashcardReviewWidget } from '@/components/dashboard/FlashcardReviewWidget';
import { ExploreMoreSection } from '@/components/dashboard/ExploreMoreSection';
import type { DashboardData, DashboardStats } from '@/components/dashboard/types';

// Lazy-load heavy dashboard components
const OnboardingWalkthrough = dynamic(() => import('@/components/onboarding/OnboardingWalkthrough').then((m) => ({ default: m.OnboardingWalkthrough })), { ssr: false });
const ShareReadingCard = dynamic(() => import('@/components/share/ReadingShareCard').then((m) => ({ default: m.ShareReadingCard })), { ssr: false });
const StreakCalendar = dynamic(() => import('@/components/dashboard/StreakCalendar'), { ssr: false });
const BookClubsWidget = dynamic(() => import('@/components/dashboard/BookClubsWidget'), { ssr: false });

const INSIGHTS_POOL_KEYS: InsightKey[] = [
  { agentKey: 'agent_companion', icon: '\uD83D\uDCD6', key: 'insight_companion' },
  { agentKey: 'agent_research', icon: '\uD83D\uDD2C', key: 'insight_research' },
  { agentKey: 'agent_coach', icon: '\uD83C\uDFAF', key: 'insight_coach' },
  { agentKey: 'agent_synthesis', icon: '\uD83E\uDDE0', key: 'insight_synthesis' },
  { agentKey: 'agent_friend', icon: '\uD83E\uDD1D', key: 'insight_friend' },
] as const;

function getTimeGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'greeting_late_night';
  if (hour < 12) return 'greeting_morning';
  if (hour < 17) return 'greeting_afternoon';
  if (hour < 21) return 'greeting_evening';
  return 'greeting_night';
}

// Static milestones map — keys into dashboard namespace, hoisted to module scope
const STREAK_MILESTONES: Record<number, string> = {
  3: 'streak_milestone_3',
  7: 'streak_milestone_7',
  14: 'streak_milestone_14',
  30: 'streak_milestone_30',
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  usePageTitle(t('page_title'));
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();
  const celebratedMilestones = useRef<Set<number>>(new Set());

  const [greetingKey, setGreetingKey] = useState('greeting_morning');
  const [insightOfDayKey, setInsightOfDayKey] = useState<InsightKey | null>(null);

  useEffect(() => {
    setGreetingKey(getTimeGreetingKey());
    setInsightOfDayKey(INSIGHTS_POOL_KEYS[new Date().getDate() % INSIGHTS_POOL_KEYS.length]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get<DashboardData>('/api/stats/dashboard')
      .then((res) => {
        if (!cancelled) setDashboardData((res.data) ?? null);
      })
      .catch(() => {
        if (!cancelled) setError(t('failed_load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

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

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (res.success) {
        const locale = window.location.pathname.split('/')[1] || 'en';
        window.location.href = `/${locale}/library`;
      }
    } catch {
      toast(t('failed_seed_sample'), 'error');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <main className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Welcome */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
          {!hasData && !loading ? (t(greetingKey) || t('welcome')) : t('welcome_back')}
        </h1>
        <div className="text-gray-500 mt-2 text-sm sm:text-base">
          {loading ? (
            <SkeletonPulse className="w-48 h-5 inline-block" />
          ) : hasData && streak > 0 ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
              {t('streak_message', { streak })}
            </span>
          ) : !hasData ? (
            t('upload_to_start')
          ) : (
            t('what_read_today')
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up">
          {error}
        </div>
      )}

      {/* No active reading: warm welcome state */}
      {!hasData && !loading ? (
        <WelcomeSection onSeedSample={handleSeedSample} seeding={seeding} />
      ) : (
        /* Active user: primary cards */
        <CurrentReadingSection
          recentBooks={recentBooks}
          stats={stats}
          loading={loading}
          insightOfDayKey={insightOfDayKey}
        />
      )}

      {/* Weekly Reading Summary */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <WeeklySummaryWidget />
        </div>
      )}

      {/* Reading Goals */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <ReadingGoalsWidget />
        </div>
      )}

      {/* Reading Speed Comparison */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <ReadingSpeedWidget />
        </div>
      )}

      {/* Challenges & Recommendations */}
      {hasData && !loading && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
          <DashboardChallenges />
          <DashboardRecommendations />
        </div>
      )}

      {/* Streak Calendar */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <StreakCalendar />
        </div>
      )}

      {/* View Detailed Stats */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <Link
            href="/stats"
            className="flex items-center justify-between p-4 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-amber-200 dark:hover:border-amber-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('view_detailed_stats')}</span>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* Book Clubs */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <BookClubsWidget />
        </div>
      )}

      {/* Flashcard Review */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <FlashcardReviewWidget />
        </div>
      )}

      {/* Explore More */}
      {hasData && !loading && (
        <>
          <ExploreMoreSection />
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <ShareReadingCard />
          </div>
        </>
      )}

      {/* Onboarding walkthrough for new users */}
      <OnboardingWalkthrough />
    </main>
  );
}
