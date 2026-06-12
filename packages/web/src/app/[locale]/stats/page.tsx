'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useStatsData } from '@/hooks/useStatsData';
import { useEffect } from 'react';
import { StatsLoadingSkeleton } from '@/components/stats/StatsLoadingSkeleton';
import { EmptyState } from '@/components/stats/EmptyState';
import { OverviewCards } from '@/components/stats/OverviewCards';
import { FlashcardMetrics } from '@/components/stats/FlashcardMetrics';
import { LibraryStatus } from '@/components/stats/LibraryStatus';
import { WeeklyActivity } from '@/components/stats/WeeklyActivity';
import { ReadingSpeed } from '@/components/stats/ReadingSpeed';
import { ReadingVelocityTrend } from '@/components/stats/ReadingVelocityTrend';
import { RecentSessions } from '@/components/stats/RecentSessions';
import { BookBreakdown } from '@/components/stats/BookBreakdown';
import { ActivityHeatmap } from '@/components/stats/ActivityHeatmap';
import { Achievements } from '@/components/stats/Achievements';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function StatsPage() {
 const t = useTranslations('stats');
 usePageTitle(t('page_title'));

 const { data, sessions, flashcardStats, speedData, bookSpeeds, loading, error, refetch } = useStatsData();

 // Refetch on tab focus
 useEffect(() => {
  const onFocus = () => refetch();
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
 }, [refetch]);

 const stats = data?.stats;
 const weekly = data?.weeklyActivity || [];
 const statusCounts = data?.booksByStatus || { unread: 0, reading: 0, completed: 0 };

 return (
 <section aria-label={t('page_title')} className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
  {/* Back */}
  <div className="mb-6">
  <Link href="/dashboard" prefetch={false} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors min-h-[44px]" aria-label={t('dashboard')}>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
   </svg>
   {t('dashboard')}
  </Link>
  </div>

  {/* Header */}
  <div className="mb-8">
  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('title')}</h1>
  <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
  </div>

  {error && (
  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between">
   <span>{error}</span>
   <button type="button"
    onClick={refetch}
    className="ml-4 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[44px]"
   >
    {t('retry')}
   </button>
  </div>
  )}

  {loading ? (
  <StatsLoadingSkeleton />
  ) : (!data && !error) ? (
  <EmptyState />
  ) : (
  <div className="space-y-5">
   <OverviewCards stats={stats} sessions={sessions} />

   {flashcardStats && flashcardStats.totalCards > 0 && (
   <FlashcardMetrics flashcardStats={flashcardStats} />
   )}

   <LibraryStatus stats={stats} statusCounts={statusCounts} />

   <WeeklyActivity weekly={weekly} />

   <ReadingSpeed speedData={speedData} bookSpeeds={bookSpeeds} />

   <ErrorBoundary label="ReadingVelocityTrend">
     <ReadingVelocityTrend sessions={sessions} />
   </ErrorBoundary>

   <RecentSessions sessions={sessions} />

   {data?.recentBooks && data.recentBooks.length > 0 && (
   <ErrorBoundary label="BookBreakdown">
     <BookBreakdown books={data.recentBooks} />
   </ErrorBoundary>
   )}

   <ErrorBoundary label="ActivityHeatmap">
     <ActivityHeatmap sessions={sessions} />
   </ErrorBoundary>

   {stats && (
   <Achievements stats={stats} />
   )}
  </div>
  )}
 </section>
 );
}
