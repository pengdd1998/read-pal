'use client';

interface BookCompletionModalProps {
  bookTitle: string;
  totalHighlights: number;
  totalNotes: number;
  totalChapters: number;
  onClose: () => void;
}

export function BookCompletionModal({
  bookTitle,
  totalHighlights,
  totalNotes,
  totalChapters,
  onClose,
}: BookCompletionModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Book completed"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-scale-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Book Complete!</h3>
        <p className="text-gray-500 mb-5">You finished <strong>{bookTitle}</strong></p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalHighlights}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Highlights</div>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalNotes}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Notes</div>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-violet-600 dark:text-violet-400">{totalChapters}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Chapters</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          Amazing! Keep Exploring
        </button>
      </div>
    </div>
  );
}
