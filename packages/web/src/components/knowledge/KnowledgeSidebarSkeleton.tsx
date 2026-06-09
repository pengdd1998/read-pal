'use client';

import React from 'react';

export const KnowledgeSidebarSkeleton = React.memo(function KnowledgeSidebarSkeleton() {
  return (
    <>
      {/* Cross-book themes skeleton */}
      <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28 mb-3 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5 animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
        </div>
      </div>

      {/* Knowledge gaps skeleton */}
      <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
        </div>
      </div>

      {/* Legend skeleton */}
      <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-3 animate-pulse" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20 animate-pulse" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24 animate-pulse" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-18 animate-pulse" />
        </div>
      </div>
    </>
  );
});
