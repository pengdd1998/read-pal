export default function Loading() {
 return (
 <div aria-busy="true" className="px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
  <div className="flex gap-6 mb-8">
  <div className="w-32 h-44 rounded-xl skeleton animate-pulse flex-shrink-0" />
  <div className="flex-1 space-y-3">
   <div className="h-7 skeleton rounded-lg w-3/4 animate-pulse" />
   <div className="h-5 skeleton rounded-lg w-1/2 animate-pulse" />
   <div className="h-4 skeleton rounded-lg w-1/3 animate-pulse" />
  </div>
  </div>
  <div className="space-y-4">
  <div className="h-32 skeleton rounded-xl animate-pulse" />
  <div className="h-24 skeleton rounded-xl animate-pulse" />
  </div>
 </div>
 );
}
