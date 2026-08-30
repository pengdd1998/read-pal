'use client';

import React from 'react';

export const LibraryLoadingSkeleton = React.memo(function LibraryLoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="border-2 border-dashed border-surface-3 rounded-2xl bg-surface-1 p-12 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[3/4] bg-surface-3 rounded-xl mb-3" />
            <div className="h-4 bg-surface-3 rounded w-3/4" />
            <div className="h-3 bg-surface-1 rounded w-1/2 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
});
