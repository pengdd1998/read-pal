export default function ReadLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header bar skeleton */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="flex-1 min-w-0">
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-lg w-28 mt-1.5 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Progress bar skeleton */}
      <div className="h-1 bg-gray-100 dark:bg-gray-800">
        <div className="h-full w-1/3 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </div>

      {/* Content area skeleton */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Chapter title */}
        <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/4 mb-8 animate-pulse" />

        {/* Paragraphs */}
        <div className="space-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${85 + Math.random() * 15}%` }} />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${70 + Math.random() * 25}%` }} />
              {i % 2 === 0 && (
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
