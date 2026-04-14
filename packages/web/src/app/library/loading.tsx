export default function LibraryLoading() {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-6 sm:mb-8">
        <div className="animate-slide-up">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-36 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 mt-1 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          {/* Search bar skeleton */}
          <div className="hidden sm:block h-10 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 w-44 animate-pulse" />
          {/* View toggle skeleton */}
          <div className="flex items-center gap-1 bg-surface-1 rounded-xl p-1 border border-gray-200 dark:border-gray-700 animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="w-8 h-8 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Mobile search bar skeleton */}
      <div className="sm:hidden mb-4">
        <div className="h-10 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 animate-pulse" />
      </div>

      {/* Book grid skeleton — matches LibraryGrid layout */}
      <div className="animate-slide-up">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="group">
              {/* Book cover placeholder — matches BookCard aspect ratio */}
              <div className="aspect-[3/4] rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 animate-pulse" />
              {/* Title */}
              <div className="mt-2">
                <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
              </div>
              {/* Author */}
              <div className="mt-1">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
              </div>
              {/* Progress bar */}
              <div className="mt-2">
                <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
