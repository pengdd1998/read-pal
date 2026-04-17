export default function MemoryBookDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 animate-fade-in">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-64 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-96 mt-3 animate-pulse" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="h-5 bg-gray-100 dark:bg-gray-800 rounded-lg w-48 mb-4 animate-pulse" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-5/6 animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-4/6 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
