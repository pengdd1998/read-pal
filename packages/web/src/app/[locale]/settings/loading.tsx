export default function SettingsLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-12 animate-fade-in">
  <div className="mb-8">
  <div className="h-8 bg-surface-2 rounded-lg w-32 animate-pulse" />
  <div className="h-4 bg-surface-2 rounded-lg w-56 mt-2 animate-pulse" />
  </div>
  {Array.from({ length: 3 }).map((_, i) => (
  <div key={i} className="mb-6">
   <div className="flex items-center gap-3 mb-4">
   <div className="w-9 h-9 rounded-xl bg-surface-2 animate-pulse" />
   <div className="h-5 bg-surface-2 rounded-lg w-32 animate-pulse" />
   </div>
   <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-5">
   <div className="h-4 bg-surface-1 rounded w-24 animate-pulse" />
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    {Array.from({ length: 3 }).map((_, j) => (
    <div key={j} className="h-10 bg-surface-1 rounded-xl animate-pulse" />
    ))}
   </div>
   <div className="h-4 bg-surface-1 rounded w-20 animate-pulse" />
   <div className="h-2 bg-surface-1 rounded-full animate-pulse" />
   </div>
  </div>
  ))}
 </div>
 );
}
