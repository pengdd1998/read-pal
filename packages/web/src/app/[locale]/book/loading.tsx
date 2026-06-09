export default function Loading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
  <div className="flex gap-6 mb-8">
  <div className="w-32 h-44 rounded-xl bg-surface-2 animate-pulse flex-shrink-0" />
  <div className="flex-1 space-y-3">
   <div className="h-7 bg-surface-2 rounded-lg w-3/4 animate-pulse" />
   <div className="h-5 bg-surface-2 rounded-lg w-1/2 animate-pulse" />
   <div className="h-4 bg-surface-1 rounded-lg w-1/3 animate-pulse" />
  </div>
  </div>
  <div className="space-y-4">
  <div className="h-32 bg-surface-1 rounded-xl animate-pulse" />
  <div className="h-24 bg-surface-1 rounded-xl animate-pulse" />
  </div>
 </div>
 );
}
