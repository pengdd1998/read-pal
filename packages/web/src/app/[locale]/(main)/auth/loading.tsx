export default function AuthLoading() {
 return (
 <div aria-busy="true" className="min-h-[80vh] flex items-center justify-center px-4">
  <div className="max-w-sm w-full">
  <div className="animate-pulse space-y-6">
   <div className="flex justify-center">
   <div className="w-12 h-12 rounded-xl skeleton" />
   </div>
   <div className="h-6 skeleton rounded w-3/4 mx-auto" />
   <div className="space-y-4">
   <div className="h-10 skeleton rounded" />
   <div className="h-10 skeleton rounded" />
   <div className="h-10 skeleton rounded" />
   </div>
  </div>
  </div>
 </div>
 );
}
