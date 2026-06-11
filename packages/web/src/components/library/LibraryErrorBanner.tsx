'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface LibraryErrorBannerProps {
  error: string;
  onRetry: () => void;
}

export const LibraryErrorBanner = React.memo(function LibraryErrorBanner({
  error,
  onRetry,
}: LibraryErrorBannerProps) {
  const tc = useTranslations('common');

  return (
    <div className="animate-slide-up p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm">
      <div className="flex items-center justify-between">
        <p>{error}</p>
        <button type="button"
          onClick={onRetry}
          aria-label={tc('retry')}
          className="ml-4 min-h-[44px] px-4 py-2 bg-red-100 dark:bg-red-900 rounded-lg text-xs font-medium hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
        >
          {tc('retry')}
        </button>
      </div>
    </div>
  );
});
