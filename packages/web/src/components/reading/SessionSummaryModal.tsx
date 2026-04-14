'use client';

interface SessionSummaryModalProps {
  duration: number;
  chaptersRead: number;
  totalChapters: number;
  onKeepReading: () => void;
  onBackToLibrary: () => void;
}

export function SessionSummaryModal({
  duration,
  chaptersRead,
  totalChapters,
  onKeepReading,
  onBackToLibrary,
}: SessionSummaryModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reading session summary"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={onKeepReading}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="text-4xl mb-3">{'\uD83D\uDCD6'}</div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Reading Session</h3>
          <p className="text-sm text-gray-500 mb-4">Great reading today!</p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {Math.floor(duration / 60)}m {duration % 60}s
              </div>
              <div className="text-xs text-gray-500 mt-1">Time spent</div>
            </div>
            <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3">
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {chaptersRead}/{totalChapters}
              </div>
              <div className="text-xs text-gray-500 mt-1">Chapters read</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onKeepReading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Keep Reading
            </button>
            <button
              onClick={onBackToLibrary}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              Back to Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
