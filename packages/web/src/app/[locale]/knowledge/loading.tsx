export default function KnowledgeLoading() {
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-64 mt-2 animate-pulse" />
      </div>

      {/* Graph placeholder skeleton */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="aspect-[16/9] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center">
          <div className="space-y-3 text-center">
            <div className="w-12 h-12 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mx-auto animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
