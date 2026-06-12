'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ReadingGoalsWidget } from '@/components/dashboard/ReadingGoalsWidget';
import { WeeklySummaryWidget } from '@/components/dashboard/WeeklySummaryWidget';
import { ReadingSpeedWidget } from '@/components/dashboard/ReadingSpeedWidget';
import { DashboardChallenges } from '@/components/dashboard/DashboardChallenges';
import { DashboardRecommendations } from '@/components/dashboard/DashboardRecommendations';
import { StatsLink } from '@/components/dashboard/StatsLink';
import { SkeletonPulse } from '@/components/dashboard/SkeletonPulse';

interface DashboardWidgetGridProps {
  hasData: boolean;
  loading: boolean;
}

function WidgetSkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-2xl border border-surface-2 bg-surface-0 p-5 sm:p-6 shadow-sm">
      {children}
    </div>
  );
}

const DashboardWidgetGridSkeleton = React.memo(function DashboardWidgetGridSkeleton() {
  return (
    <>
      <WidgetSkeletonCard>
        <SkeletonPulse className="h-4 w-40 mb-4" />
        <SkeletonPulse className="h-20 w-full mb-3" />
        <div className="grid grid-cols-3 gap-3">
          <SkeletonPulse className="h-12 w-full" />
          <SkeletonPulse className="h-12 w-full" />
          <SkeletonPulse className="h-12 w-full" />
        </div>
      </WidgetSkeletonCard>

      <WidgetSkeletonCard>
        <SkeletonPulse className="h-4 w-28 mb-4" />
        <div className="space-y-3">
          <SkeletonPulse className="h-16 w-full" />
          <SkeletonPulse className="h-16 w-full" />
        </div>
      </WidgetSkeletonCard>

      <WidgetSkeletonCard>
        <SkeletonPulse className="h-4 w-36 mb-4" />
        <div className="space-y-2">
          <SkeletonPulse className="h-8 w-full" />
          <SkeletonPulse className="h-8 w-full" />
          <SkeletonPulse className="h-8 w-full" />
        </div>
      </WidgetSkeletonCard>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <WidgetSkeletonCard>
          <SkeletonPulse className="h-4 w-32 mb-3" />
          <SkeletonPulse className="h-8 w-full" />
        </WidgetSkeletonCard>
        <WidgetSkeletonCard>
          <SkeletonPulse className="h-4 w-28 mb-3" />
          <SkeletonPulse className="h-8 w-full" />
        </WidgetSkeletonCard>
      </div>
    </>
  );
});

export const DashboardWidgetGrid = React.memo(function DashboardWidgetGrid({
  hasData,
  loading,
}: DashboardWidgetGridProps) {
  const t = useTranslations('dashboard');

  if (!hasData) return null;

  if (loading) return <DashboardWidgetGridSkeleton />;

  return (
    <>
      <div className="mt-5 animate-fade-in">
        <WeeklySummaryWidget />
      </div>

      <div className="mt-5 animate-fade-in">
        <ReadingGoalsWidget />
      </div>

      <div className="mt-5 animate-fade-in">
        <ReadingSpeedWidget />
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
        <DashboardChallenges />
        <DashboardRecommendations />
      </div>

      <StatsLink label={t('view_detailed_stats')} />
    </>
  );
});
