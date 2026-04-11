export default function FriendLoading() {
  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-8 animate-fade-in">
      <div className="mb-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-48 animate-pulse" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-64 mt-2 animate-pulse" />
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-pulse">
        <div className="h-14 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 mt-1" />
          </div>
        </div>
        <div className="p-4 space-y-4 min-h-[300px]">
          <div className="flex justify-start">
            <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm p-3">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-36 mt-2" />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[80%] bg-amber-100 dark:bg-amber-900/20 rounded-2xl rounded-br-sm p-3">
              <div className="h-3 bg-amber-200 dark:bg-amber-800 rounded w-32" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
