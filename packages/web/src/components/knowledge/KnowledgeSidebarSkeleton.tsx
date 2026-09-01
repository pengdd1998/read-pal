'use client';

import React from 'react';

export const KnowledgeSidebarSkeleton = React.memo(function KnowledgeSidebarSkeleton() {
  return (
    <>
      {/* Cross-book themes skeleton */}
      <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
        <div className="h-4 skeleton rounded w-28 mb-3 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 skeleton rounded w-full animate-pulse" />
          <div className="h-3 skeleton rounded w-4/5 animate-pulse" />
          <div className="h-3 skeleton rounded w-3/4 animate-pulse" />
        </div>
      </div>

      {/* Knowledge gaps skeleton */}
      <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
        <div className="h-4 skeleton rounded w-32 mb-3 animate-pulse" />
        <div className="space-y-2">
          <div className="h-3 skeleton rounded w-full animate-pulse" />
          <div className="h-3 skeleton rounded w-2/3 animate-pulse" />
        </div>
      </div>

      {/* Legend skeleton */}
      <div className="bg-surface-0 rounded-xl border border-surface-3 p-4">
        <div className="h-4 skeleton rounded w-16 mb-3 animate-pulse" />
        <div className="flex flex-wrap gap-2">
          <div className="h-6 skeleton rounded-full w-20 animate-pulse" />
          <div className="h-6 skeleton rounded-full w-16 animate-pulse" />
          <div className="h-6 skeleton rounded-full w-24 animate-pulse" />
          <div className="h-6 skeleton rounded-full w-18 animate-pulse" />
        </div>
      </div>
    </>
  );
});
