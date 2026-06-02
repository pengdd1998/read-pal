export default function KnowledgeLoading() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-950">
      {/* Header skeleton */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-surface-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-56 mt-1.5 animate-pulse" />
          </div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-16 animate-pulse" />
        </div>
      </div>

      {/* Main content: graph + sidebar grid */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Graph visualization placeholder (spans 2 cols on lg) */}
          <div className="lg:col-span-2 bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
            </div>
            {/* SVG area placeholder with fake nodes */}
            <div className="h-[420px] relative bg-gray-50 dark:bg-gray-900/50">
              <svg className="w-full h-full" viewBox="0 0 600 420">
                {/* Fake connection lines */}
                <line x1="120" y1="100" x2="300" y2="180" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="300" y1="180" x2="200" y2="300" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="300" y1="180" x2="460" y2="120" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="460" y1="120" x2="500" y2="280" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="200" y1="300" x2="350" y2="350" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="120" y1="100" x2="80" y2="250" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                <line x1="500" y1="280" x2="350" y2="350" stroke="#e5e7eb" strokeWidth="1.5" opacity="0.5" />
                {/* Fake node circles with pulse */}
                <circle cx="120" cy="100" r="14" fill="#0d9488" opacity="0.25" className="animate-pulse" />
                <circle cx="300" cy="180" r="18" fill="#7c3aed" opacity="0.25" className="animate-pulse" />
                <circle cx="200" cy="300" r="12" fill="#ea580c" opacity="0.25" className="animate-pulse" />
                <circle cx="460" cy="120" r="10" fill="#2563eb" opacity="0.25" className="animate-pulse" />
                <circle cx="500" cy="280" r="13" fill="#059669" opacity="0.25" className="animate-pulse" />
                <circle cx="350" cy="350" r="9" fill="#d97706" opacity="0.25" className="animate-pulse" />
                <circle cx="80" cy="250" r="11" fill="#dc2626" opacity="0.25" className="animate-pulse" />
              </svg>
            </div>
          </div>

          {/* Sidebar placeholder */}
          <div className="space-y-4">
            {/* Cross-book themes skeleton */}
            <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28 mb-3 animate-pulse" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5 animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
              </div>
            </div>

            {/* Knowledge gaps skeleton */}
            <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-3 animate-pulse" />
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
              </div>
            </div>

            {/* Legend skeleton */}
            <div className="bg-surface-0 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-3 animate-pulse" />
              <div className="flex flex-wrap gap-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20 animate-pulse" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16 animate-pulse" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24 animate-pulse" />
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-18 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
