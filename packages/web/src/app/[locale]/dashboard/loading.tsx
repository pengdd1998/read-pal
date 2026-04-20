export default function DashboardLoading() {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
      {/* Welcome header skeleton */}
      <div className="mb-8 animate-fade-in">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 animate-pulse" />
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-64 mt-2 animate-pulse" />
      </div>

      {/* Current reading card skeleton — matches the active user layout */}
      <div className="space-y-5 animate-fade-in">
        <div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-4">
              {/* Book cover placeholder */}
              <div className="w-14 h-20 rounded-lg bg-gradient-to-br from-primary-400/30 to-primary-600/30 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
                <div className="flex items-center gap-3">
                  <div className="flex-1 max-w-[180px]">
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2" />
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-8 animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Streak card skeleton */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50/50 to-amber-50/50 dark:from-orange-950/20 dark:to-amber-950/20 animate-pulse" />
          <div className="flex-1">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-10 mb-1 animate-pulse" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 animate-pulse" />
          </div>
        </div>

        {/* Insight card skeleton */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 border-l-4 border-l-primary-400/30 dark:border-l-primary-600/30 p-6">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="flex-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2 animate-pulse" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
            </div>
          </div>
        </div>

        {/* Reading goals skeleton */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3 animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto mb-1 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto animate-pulse" />
            </div>
            <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto mb-1 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
