'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ReadingGoalsWidget } from '@/components/dashboard/ReadingGoalsWidget';
import { WeeklySummaryWidget } from '@/components/dashboard/WeeklySummaryWidget';
import { ReadingSpeedWidget } from '@/components/dashboard/ReadingSpeedWidget';
import { DashboardChallenges } from '@/components/dashboard/DashboardChallenges';
import { DashboardRecommendations } from '@/components/dashboard/DashboardRecommendations';
import { StatsLink } from '@/components/dashboard/StatsLink';

interface DashboardWidgetGridProps {
  hasData: boolean;
  loading: boolean;
}

export const DashboardWidgetGrid = React.memo(function DashboardWidgetGrid({
  hasData,
  loading,
}: DashboardWidgetGridProps) {
  const t = useTranslations('dashboard');

  if (!hasData || loading) return null;

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
