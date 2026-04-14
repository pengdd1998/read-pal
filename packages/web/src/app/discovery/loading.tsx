export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 mb-6 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse">
            <div className="aspect-[3/4] rounded-t-xl bg-gray-200 dark:bg-gray-700" />
            <div className="p-3 space-y-2">
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
