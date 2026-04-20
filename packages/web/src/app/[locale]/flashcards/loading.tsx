export default function FlashcardsLoading() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-2 animate-pulse" />
      </div>

      {/* Flashcard grid skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3 animate-pulse" />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
              </div>
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse flex-shrink-0" />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded-full w-16 animate-pulse" />
              <div className="h-6 bg-gray-100 dark:bg-gray-800 rounded-full w-20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
