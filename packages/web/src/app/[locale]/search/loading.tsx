export default function SearchLoading() {
 return (
 <div aria-busy="true" className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
  <div className="mb-6 sm:mb-8">
  <div className="h-8 skeleton rounded-lg w-32 animate-pulse" />
  <div className="h-4 skeleton rounded-lg w-64 mt-2 animate-pulse" />
  </div>
  <div className="h-14 skeleton rounded-xl animate-pulse mb-6" />
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
  {Array.from({ length: 6 }).map((_, i) => (
   <div key={i} className="flex items-center gap-3 bg-surface-0 rounded-xl border border-surface-3 p-3 animate-pulse">
   <div className="w-10 h-14 rounded-lg skeleton" />
   <div className="flex-1 space-y-2">
    <div className="h-4 skeleton rounded w-3/4" />
    <div className="h-3 skeleton rounded w-1/2" />
   </div>
   </div>
  ))}
  </div>
 </div>
 );
}
