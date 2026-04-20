export default function DevelopersLoading() {
  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-8 sm:py-12 animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-52 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-72 mt-2 animate-pulse" />
      </div>

      {/* API endpoint cards skeleton */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-5 bg-green-100 dark:bg-green-900/30 rounded w-14 animate-pulse" />
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded flex-1 max-w-xs animate-pulse" />
            </div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
