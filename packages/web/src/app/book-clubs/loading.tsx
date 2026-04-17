export default function BookClubsLoading() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-36 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-52 mt-2 animate-pulse" />
        </div>
        <div className="h-10 bg-primary-600/20 rounded-xl w-28 animate-pulse" />
      </div>

      {/* Club list skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
