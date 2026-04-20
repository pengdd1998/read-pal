export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex gap-6 mb-8">
        <div className="w-32 h-44 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 animate-pulse" />
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/2 animate-pulse" />
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-1/3 animate-pulse" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
