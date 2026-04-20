export default function BookClubDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Back link skeleton */}
      <div className="mb-6">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
      </div>

      {/* Club header skeleton */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="flex-1">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
          </div>
        </div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
      </div>

      {/* Discussion skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
