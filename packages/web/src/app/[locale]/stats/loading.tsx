export default function StatsLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 animate-fade-in">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-2 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mx-auto mt-2" />
          </div>
        ))}
      </div>
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse">
            <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded w-32 mb-4" />
            <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
