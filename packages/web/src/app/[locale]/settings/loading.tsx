export default function SettingsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-2 animate-pulse" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-24 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-20 animate-pulse" />
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
