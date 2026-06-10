'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useDashboardData } from '@/hooks/useDashboardData';
import { WelcomeSection } from '@/components/dashboard/WelcomeSection';
import { CurrentReadingSection } from '@/components/dashboard/CurrentReadingSection';
import type { InsightKey } from '@/components/dashboard/CurrentReadingSection';
import { DashboardWidgetGrid } from '@/components/dashboard/DashboardWidgetGrid';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { FlashcardReviewWidget } from '@/components/dashboard/FlashcardReviewWidget';
import { ExploreMoreSection } from '@/components/dashboard/ExploreMoreSection';

// Lazy-load heavy dashboard components
const OnboardingWalkthrough = dynamic(() => import('@/components/onboarding/OnboardingWalkthrough').then((m) => ({ default: m.OnboardingWalkthrough })), { ssr: false, loading: () => <div className="h-32 w-full animate-pulse bg-surface-2 rounded-xl" /> });
const ShareReadingCard = dynamic(() => import('@/components/share/ReadingShareCard').then((m) => ({ default: m.ShareReadingCard })), { ssr: false, loading: () => <div className="h-32 w-full animate-pulse bg-surface-2 rounded-xl" /> });
const StreakCalendar = dynamic(() => import('@/components/dashboard/StreakCalendar'), { ssr: false, loading: () => <div className="h-32 w-full animate-pulse bg-surface-2 rounded-xl" /> });
const BookClubsWidget = dynamic(() => import('@/components/dashboard/BookClubsWidget').then((m) => ({ default: m.default })), { ssr: false, loading: () => <div className="h-32 w-full animate-pulse bg-surface-2 rounded-xl" /> });

const INSIGHTS_POOL_KEYS: InsightKey[] = [
  { agentKey: 'agent_companion', icon: '📖', key: 'insight_companion' },
  { agentKey: 'agent_research', icon: '🔬', key: 'insight_research' },
  { agentKey: 'agent_coach', icon: '🎯', key: 'insight_coach' },
  { agentKey: 'agent_synthesis', icon: '🧠', key: 'insight_synthesis' },
  { agentKey: 'agent_friend', icon: '🤝', key: 'insight_friend' },
] as const;

function getTimeGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'greeting_late_night';
  if (hour < 12) return 'greeting_morning';
  if (hour < 17) return 'greeting_afternoon';
  if (hour < 21) return 'greeting_evening';
  return 'greeting_night';
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  usePageTitle(t('page_title'));
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || '';
  const [mounted, setMounted] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const [greetingKey, setGreetingKey] = useState('greeting_morning');
  const [insightOfDayKey, setInsightOfDayKey] = useState<InsightKey | null>(null);

  useEffect(() => {
    setMounted(true);
    setGreetingKey(getTimeGreetingKey());
    setInsightOfDayKey(INSIGHTS_POOL_KEYS[new Date().getDate() % INSIGHTS_POOL_KEYS.length]);
  }, []);

  const { stats, recentBooks, streak, hasData, loading, error, retry } = useDashboardData();

  const handleSeedSample = async () => {
    try {
      setSeeding(true);
      const res = await api.post<{ book: { id: string } }>('/api/books/seed-sample');
      if (!mountedRef.current) return;
      if (res.success) {
        const locale = window.location.pathname.split('/')[1] || 'en';
        window.location.href = `/${locale}/library`;
      } else {
        toast(t('failed_seed_sample'), 'error');
      }
    } catch (err) {
      console.warn('Dashboard: failed to seed sample', err);
      if (!mountedRef.current) return;
      toast(t('failed_seed_sample'), 'error');
    } finally {
      if (mountedRef.current) setSeeding(false);
    }
  };

  return (
    <main id="main-content" aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <DashboardHeader
        loading={loading}
        mounted={mounted}
        hasData={hasData}
        firstName={firstName}
        streak={streak}
        greetingKey={greetingKey}
        greeting={t(greetingKey) || ''}
        welcomeBackName={t('welcome_back_name', { name: firstName || t('welcome_back') })}
        welcomeBack={t('welcome_back')}
        welcome={t('welcome')}
        streakMessage={t('streak_message', { streak })}
        uploadToStart={t('upload_to_start')}
        whatReadToday={t('what_read_today')}
      />

      {/* Error */}
      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm animate-slide-up flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={retry}
            className="ml-4 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {t('retry')}
          </button>
        </div>
      )}

      {/* No active reading: warm welcome state */}
      {!hasData && !loading ? (
        <WelcomeSection onSeedSample={handleSeedSample} seeding={seeding} />
      ) : (
        <CurrentReadingSection
          recentBooks={recentBooks}
          stats={stats}
          loading={loading}
          insightOfDayKey={insightOfDayKey}
        />
      )}

      <DashboardWidgetGrid hasData={hasData} loading={loading} />

      {/* Streak Calendar */}
      {hasData && !loading && (
        <div className="mt-5 animate-fade-in">
          <StreakCalendar />
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
          <div className="mt-4 pt-4 border-t border-surface-2">
            <ShareReadingCard />
          </div>
        </>
      )}

      {/* Onboarding walkthrough for new users */}
      <OnboardingWalkthrough />
    </main>
  );
}
