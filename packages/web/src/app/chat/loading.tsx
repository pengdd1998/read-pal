export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
