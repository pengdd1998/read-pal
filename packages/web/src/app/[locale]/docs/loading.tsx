export default function DocsLoading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 animate-fade-in">
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 mb-6 animate-pulse" />
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6 animate-pulse" />
        <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg w-full animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6 animate-pulse" />
      </div>
    </div>
  );
}
