'use client';

import React from 'react';

interface SavingIndicatorProps {
  saving: boolean;
  saved: boolean;
  savingText: string;
  savedText: string;
}

export const SavingIndicator = React.memo(function SavingIndicator({
  saving,
  saved,
  savingText,
  savedText,
}: SavingIndicatorProps) {
  if (!saving && !saved) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium animate-slide-up transition-all ${
        saved
          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
          : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
      }`}
    >
      {saved ? (
        <>
          <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {savedText}
        </>
      ) : (
        <>
          <div aria-hidden="true" className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          {savingText}
        </>
      )}
    </div>
  );
});
