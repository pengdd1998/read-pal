export default function LibraryLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header skeleton */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-56 mt-2 animate-pulse" />
        </div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
            style={{ width: `${60 + i * 20}px` }}
          />
        ))}
      </div>

      {/* Book grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            {/* Cover placeholder */}
            <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-lg mb-3" />
            {/* Title */}
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            {/* Author */}
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mt-2" />
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
