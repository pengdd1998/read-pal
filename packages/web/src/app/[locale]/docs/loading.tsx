export default function DocsLoading() {
 return (
 <div aria-busy="true" className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-fade-in">
  <div className="h-8 skeleton rounded-lg w-48 mb-6 animate-pulse" />
  <div className="space-y-4">
  <div className="h-4 skeleton rounded w-full animate-pulse" />
  <div className="h-4 skeleton rounded w-5/6 animate-pulse" />
  <div className="h-4 skeleton rounded w-4/6 animate-pulse" />
  <div className="h-32 skeleton rounded-lg w-full animate-pulse" />
  <div className="h-4 skeleton rounded w-3/4 animate-pulse" />
  <div className="h-4 skeleton rounded w-5/6 animate-pulse" />
  </div>
 </div>
 );
}
