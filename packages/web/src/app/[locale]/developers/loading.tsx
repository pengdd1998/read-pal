export default function DevelopersLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
  {/* Header skeleton */}
  <div className="mb-8">
  <div className="h-8 bg-surface-2 rounded-lg w-52 animate-pulse" />
  <div className="h-4 bg-surface-2 rounded-lg w-72 mt-2 animate-pulse" />
  </div>

  {/* API endpoint cards skeleton */}
  <div className="space-y-4">
  {Array.from({ length: 5 }).map((_, i) => (
   <div
   key={i}
   className="bg-surface-0 rounded-2xl border border-surface-3 p-5"
   >
   <div className="flex items-center gap-3 mb-3">
    <div className="h-5 bg-green-100 dark:bg-green-900/30 rounded w-14 animate-pulse" />
    <div className="h-5 bg-surface-2 rounded flex-1 max-w-xs animate-pulse" />
   </div>
   <div className="h-4 bg-surface-2 rounded w-2/3 animate-pulse" />
   </div>
  ))}
  </div>
 </div>
 );
}
