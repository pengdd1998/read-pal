export default function AuthLoading() {
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="animate-pulse space-y-6">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto" />
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    </main>
  );
}
