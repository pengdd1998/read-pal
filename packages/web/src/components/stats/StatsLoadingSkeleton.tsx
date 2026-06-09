'use client';

export function StatsLoadingSkeleton() {
 return (
 <div className="space-y-4">
  {Array.from({ length: 4 }).map((_, i) => (
  <div key={i} className="bg-surface-0 dark:bg-gray-800 rounded-xl border border-surface-3 dark:border-gray-700 p-6 animate-pulse">
   <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-24 mb-4" />
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
   {Array.from({ length: 3 }).map((_, j) => (
    <div key={j}>
    <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded w-16 mx-auto mb-2" />
    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-12 mx-auto" />
    </div>
   ))}
   </div>
  </div>
  ))}
 </div>
 );
}
