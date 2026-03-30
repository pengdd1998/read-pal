export default function KnowledgeLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-9 bg-gray-200 dark:bg-gray-700 rounded w-52 animate-pulse" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-72 mt-2 animate-pulse" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-200 dark:bg-gray-700 rounded-lg w-20 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card text-center animate-pulse">
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-14 mx-auto mt-2" />
          </div>
        ))}
      </div>

      {/* Graph placeholder skeleton */}
      <div className="card relative animate-pulse" style={{ height: '500px' }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400">Loading knowledge graph...</div>
        </div>
      </div>

      {/* Back button skeleton */}
      <div className="mt-8">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-36 animate-pulse" />
      </div>
    </div>
  );
}
