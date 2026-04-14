'use client';

import { CloudOff, Refresh } from '@/components/icons';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-6">
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
          <CloudOff className="w-10 h-10 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          You&apos;re offline
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Check your internet connection and try again. Any reading progress you made has been saved locally.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
        >
          <Refresh className="w-4 h-4" />
          Retry
        </button>
      </div>
    </div>
  );
}
