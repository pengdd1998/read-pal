'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';

export const MemoryBooksLoadingSkeleton = React.memo(function MemoryBooksLoadingSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-surface-0 rounded-xl border border-surface-3 p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-16 bg-surface-1 rounded-lg" />
            <div className="flex-1">
              <div className="h-4 bg-surface-1 rounded w-40 mb-2" />
              <div className="h-3 bg-surface-1 rounded w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

export const ErrorBanner = React.memo(function ErrorBanner({ message, onRetry, retryLabel }: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center justify-between" role="alert">
      <span>{message}</span>
      <button type="button"
        onClick={onRetry}
        className="ml-4 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 min-h-[44px]"
      >
        {retryLabel}
      </button>
    </div>
  );
});

export const EmptyState = React.memo(function EmptyState({ title, description, ctaLabel, ctaHref }: {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
        <span className="text-3xl">{'📕'}</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
        {description}
      </p>
      <Link href={ctaHref} prefetch={false} className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200">
        {ctaLabel}
      </Link>
    </div>
  );
});
