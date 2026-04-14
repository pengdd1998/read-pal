'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error.message?.toLowerCase().includes('chunk') ||
    error.message?.toLowerCase().includes('dynamically imported') ||
    error.message?.toLowerCase().includes('loading css');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center px-4 max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Something went wrong
        </h1>

        <p className="text-gray-600 dark:text-gray-400 mb-2">
          {isChunkError
            ? 'The app may have been updated. Please reload to get the latest version.'
            : error.message || 'An unexpected error occurred. Please try again.'}
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-6 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 active:scale-[0.98] transition-all shadow-soft"
          >
            Try again
          </button>
          {isChunkError ? (
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all"
            >
              Reload page
            </button>
          ) : (
            <a
              href="/"
              className="px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-[0.98] transition-all"
            >
              Go Home
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
