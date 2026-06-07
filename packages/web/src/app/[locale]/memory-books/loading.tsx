export default function MemoryBooksLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in">
  <div className="mb-8">
  <div className="h-8 bg-gray-200 rounded-lg w-44 animate-pulse" />
  <div className="h-4 bg-gray-200 rounded-lg w-64 mt-2 animate-pulse" />
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {Array.from({ length: 4 }).map((_, i) => (
   <div key={i} className="bg-surface-0 rounded-2xl border border-surface-3 p-5 animate-pulse">
   <div className="flex items-center gap-3 mb-3">
    <div className="w-12 h-16 rounded-lg bg-gray-200" />
    <div className="flex-1 space-y-2">
    <div className="h-4 bg-gray-200 rounded w-3/4" />
    <div className="h-3 bg-gray-200 rounded w-1/2" />
    </div>
   </div>
   <div className="grid grid-cols-3 gap-2">
    {Array.from({ length: 3 }).map((_, j) => (
    <div key={j} className="h-12 bg-gray-100 rounded-lg" />
    ))}
   </div>
   </div>
  ))}
  </div>
 </div>
 );
}
