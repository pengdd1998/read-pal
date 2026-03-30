'use client';

export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-5xl mb-4">Something went wrong</div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Failed to load library
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {error.message || 'An unexpected error occurred while loading your library.'}
          </p>
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
