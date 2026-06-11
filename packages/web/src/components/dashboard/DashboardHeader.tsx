'use client';

import React from 'react';
import { SkeletonPulse } from '@/components/dashboard/SkeletonPulse';

interface DashboardHeaderProps {
  loading: boolean;
  mounted: boolean;
  hasData: boolean;
  firstName: string;
  streak: number;
  greetingKey: string;
  greeting: string;
  welcomeBack: string;
  welcomeBackName: string;
  welcome: string;
  streakMessage: string;
  uploadToStart: string;
  whatReadToday: string;
}

export const DashboardHeader = React.memo(function DashboardHeader({
  loading,
  mounted,
  hasData,
  firstName,
  streak,
  greetingKey,
  greeting,
  welcomeBackName,
  welcomeBack,
  welcome,
  streakMessage,
  uploadToStart,
  whatReadToday,
}: DashboardHeaderProps) {
  const title = !hasData && !loading
    ? (greeting || welcome)
    : (mounted && firstName)
      ? welcomeBackName
      : welcomeBack;

  return (
    <div className="mb-8 animate-fade-in">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
        {title}
      </h1>
      <div className="text-gray-500 mt-2 text-sm sm:text-base">
        {loading ? (
          <SkeletonPulse className="w-48 h-5 inline-block" />
        ) : hasData && streak > 0 ? (
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse animate-streak-glow" />
            {streakMessage}
          </span>
        ) : !hasData ? (
          uploadToStart
        ) : (
          whatReadToday
        )}
      </div>
    </div>
  );
});
