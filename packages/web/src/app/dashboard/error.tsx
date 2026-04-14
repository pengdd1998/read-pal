'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isNetworkError =
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('failed to fetch');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {isNetworkError ? 'Connection problem' : 'Failed to load dashboard'}
        </h2>

        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm text-center">
          {isNetworkError
            ? 'Could not reach the server. Please check your internet connection and try again.'
            : error.message || 'An unexpected error occurred while loading your dashboard.'}
        </p>

        <div className="flex items-center gap-3">
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <a href="/" className="btn btn-secondary">
            Go Home
          </a>
        </div>
      </div>
    </div>
  );
}
