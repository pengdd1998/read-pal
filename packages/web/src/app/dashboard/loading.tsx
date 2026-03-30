export default function DashboardLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded w-64 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mt-2 animate-pulse" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto mt-2" />
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Continue reading skeleton */}
        <div className="lg:col-span-2">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4 animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mt-2" />
                  </div>
                  <div className="ml-4 w-24">
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent insights skeleton */}
        <div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-36 mb-4 animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex-1">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mt-2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity chart skeleton */}
      <div className="mt-8 card">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-36 mb-4 animate-pulse" />
        <div className="h-48 flex items-end justify-around gap-2 px-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 flex-1">
              <div
                className="w-full bg-gray-200 dark:bg-gray-700 rounded-t animate-pulse"
                style={{ height: `${Math.random() * 60 + 20}%` }}
              />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-6 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
