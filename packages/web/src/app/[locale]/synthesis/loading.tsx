export default function SynthesisLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
  {/* Header */}
  <div className="mb-8">
  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 animate-pulse" />
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-72 mt-2 animate-pulse" />
  </div>

  {/* Cross-book analysis banner skeleton */}
  <div className="mb-6 p-4 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20">
  <div className="flex items-center justify-between">
   <div className="flex-1">
   <div className="h-4 bg-teal-200/60 dark:bg-teal-700/40 rounded w-32 mb-1.5 animate-pulse" />
   <div className="h-3 bg-teal-200/60 dark:bg-teal-700/40 rounded w-52 animate-pulse" />
   </div>
   <div className="h-9 bg-teal-200/60 dark:bg-teal-700/40 rounded-xl w-28 animate-pulse" />
  </div>
  </div>

  {/* Book comparison section skeleton */}
  <div className="mb-6 p-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
  <div className="h-4 bg-amber-200/60 dark:bg-amber-700/40 rounded w-36 mb-1 animate-pulse" />
  <div className="h-3 bg-amber-200/60 dark:bg-amber-700/40 rounded w-48 mb-3 animate-pulse" />
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
   <div>
   <div className="h-3 bg-amber-200/60 dark:bg-amber-700/40 rounded w-20 mb-1 animate-pulse" />
   <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
   </div>
   <div>
   <div className="h-3 bg-amber-200/60 dark:bg-amber-700/40 rounded w-20 mb-1 animate-pulse" />
   <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
   </div>
  </div>
  <div className="h-9 bg-amber-200/60 dark:bg-amber-700/40 rounded-xl w-full animate-pulse" />
  </div>

  {/* Single-book analysis form skeleton */}
  <div className="bg-surface-0 rounded-xl border border-surface-3 p-5 mb-6">
  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4 animate-pulse" />

  {/* Book selector skeleton */}
  <div className="mb-4">
   <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-1 animate-pulse" />
   <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
  </div>

  {/* Mode selector skeleton */}
  <div className="mb-4">
   <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-2 animate-pulse" />
   <div className="flex flex-wrap gap-1.5">
   <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-28 animate-pulse" />
   <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-24 animate-pulse" />
   <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-28 animate-pulse" />
   <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-20 animate-pulse" />
   <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-24 animate-pulse" />
   </div>
  </div>

  {/* Query input skeleton */}
  <div className="mb-4">
   <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-1 animate-pulse" />
   <div className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
  </div>

  {/* Run button skeleton */}
  <div className="h-10 bg-amber-200/60 dark:bg-amber-700/40 rounded-xl w-full animate-pulse" />
  </div>
 </div>
 );
}
