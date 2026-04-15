'use client';

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Page-specific title, e.g. "Failed to load dashboard" */
  title?: string;
  /** Page-specific network error message, e.g. "Could not load your library." */
  networkMessage?: string;
  /** Contextual icon (emoji or inline SVG) */
  icon?: 'warning' | 'book' | 'chat' | 'chart' | 'search' | 'friend' | 'memory';
}

const icons: Record<string, JSX.Element> = {
  warning: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  book: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  chat: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  chart: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  search: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  friend: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  memory: (
    <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
};

/**
 * Shared error boundary UI for Next.js page-level error.tsx files.
 *
 * Features:
 * - Detects network vs. chunk vs. generic errors
 * - Shows contextual title and message per page
 * - Provides "Try again" + "Go Home" / "Reload" recovery options
 */
export function PageError({
  error,
  reset,
  title,
  networkMessage,
  icon = 'warning',
}: PageErrorProps) {
  const msg = error.message?.toLowerCase() || '';
  const isNetworkError =
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('failed to fetch') ||
    msg.includes('net::');
  const isChunkError =
    msg.includes('chunk') ||
    msg.includes('dynamically imported') ||
    msg.includes('loading css');

  const displayTitle = isNetworkError
    ? 'Connection problem'
    : isChunkError
      ? 'App update available'
      : title || 'Something went wrong';

  const displayMessage = isNetworkError
    ? networkMessage || 'Could not reach the server. Please check your connection and try again.'
    : isChunkError
      ? 'The app has been updated. Please reload to get the latest version.'
      : error.message || 'An unexpected error occurred. Please try again.';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          {icons[icon]}
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {displayTitle}
        </h2>

        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm text-center">
          {displayMessage}
        </p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
          {isChunkError ? (
            <button
              onClick={() => window.location.reload()}
              className="btn btn-secondary"
            >
              Reload page
            </button>
          ) : (
            <a href="/" className="btn btn-secondary">
              Go Home
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
