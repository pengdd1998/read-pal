export default function PrivacyLoading() {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-3xl mx-auto animate-fade-in">
  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 mb-4 animate-pulse" />
  <div className="space-y-4">
  {Array.from({ length: 8 }).map((_, i) => (
   <div key={i} className="space-y-2">
   <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
   <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
   <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6 animate-pulse" />
   </div>
  ))}
  </div>
 </div>
 );
}
