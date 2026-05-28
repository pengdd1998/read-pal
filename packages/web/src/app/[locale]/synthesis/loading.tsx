export default function SynthesisLoading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-fade-in max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-72 mt-2 animate-pulse" />
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-5 mb-6 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}
