const SKELETON_WIDTHS = [
 [90, 82, 95, 78, 88],
 [75, 85, 72, 80, 68],
 [65, 78, 70, 75, 62],
];

export default function ReadLoading() {
 return (
 <div className="min-h-screen bg-surface-0">
  {/* Header bar skeleton */}
  <div className="sticky top-0 z-30 bg-surface-0/90 backdrop-blur-md border-b border-surface-2 px-4 py-3">
  <div className="flex items-center gap-2">
   <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
   <div className="flex-1 min-w-0">
   <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-48 animate-pulse" />
   <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-lg w-28 mt-1.5 animate-pulse" />
   </div>
   <div className="flex gap-2">
   <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
   <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
   <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
   </div>
  </div>
  </div>

  {/* Progress bar skeleton */}
  <div className="h-1 bg-gray-100 dark:bg-gray-800">
  <div className="h-full w-1/3 bg-gray-200 dark:bg-gray-700 animate-pulse" />
  </div>

  {/* Content area skeleton */}
  <div className="max-w-3xl mx-auto px-6 py-12">
  {/* Chapter title */}
  <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg w-3/4 mb-8 animate-pulse" />

  {/* Paragraphs */}
  <div className="space-y-4">
   {Array.from({ length: 8 }).map((_, i) => (
   <div key={i} className="space-y-2">
    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${SKELETON_WIDTHS[0][i % 5]}%` }} />
    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${SKELETON_WIDTHS[1][i % 5]}%` }} />
    {i % 2 === 0 && (
    <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" style={{ width: `${SKELETON_WIDTHS[2][i % 5]}%` }} />
    )}
   </div>
   ))}
  </div>
  </div>
 </div>
 );
}
