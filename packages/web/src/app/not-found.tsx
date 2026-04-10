import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center px-4 animate-fade-in">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-primary-100 dark:from-amber-900/30 dark:to-primary-900/30 flex items-center justify-center">
          <span className="text-4xl">{'\uD83D\uDCD6'}</span>
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-primary-600 dark:text-primary-400 font-display">404</h1>
        <h2 className="mt-4 text-xl sm:text-2xl font-semibold text-gray-800 dark:text-gray-200">
          Page not found
        </h2>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Perhaps it&apos;s in another book.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
