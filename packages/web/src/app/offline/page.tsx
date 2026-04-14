'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950 px-6">
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Retry
        </button>
      </div>
    </div>
  );
}
