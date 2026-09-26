export default function StatsLoading() {
 return (
 <div aria-busy="true" className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
  <div className="mb-8">
  <div className="h-8 skeleton rounded-lg w-40 animate-pulse" />
  <div className="h-4 skeleton rounded-lg w-56 mt-2 animate-pulse" />
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
  {Array.from({ length: 4 }).map((_, i) => (
   <div key={i} className="skeleton rounded-xl p-4 text-center animate-pulse">
   <div className="h-8 skeleton rounded w-12 mx-auto" />
   <div className="h-3 skeleton rounded w-16 mx-auto mt-2" />
   </div>
  ))}
  </div>
  <div className="space-y-5">
  {Array.from({ length: 3 }).map((_, i) => (
   <div key={i} className="bg-surface-0 rounded-xl border border-surface-3 p-6 animate-pulse">
   <div className="h-5 bg-surface-1 rounded w-32 mb-4" />
   <div className="h-32 bg-surface-1 rounded" />
   </div>
  ))}
  </div>
 </div>
 );
}
