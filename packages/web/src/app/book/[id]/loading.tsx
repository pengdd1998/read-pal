export default function BookDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10 animate-fade-in">
      {/* Back link skeleton */}
      <div className="mb-6">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
      </div>

      {/* Book header skeleton */}
      <div className="flex gap-6 mb-8">
        {/* Cover placeholder */}
        <div className="w-28 sm:w-36 aspect-[3/4] rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 mb-3 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4 animate-pulse" />
          <div className="flex items-center gap-3 mb-4">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full w-20 animate-pulse" />
          </div>
          <div className="flex-1 max-w-[200px]">
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2" />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto mb-2 animate-pulse" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto animate-pulse" />
          </div>
        ))}
      </div>

      {/* Content tabs skeleton */}
      <div className="space-y-4">
        <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 pb-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
