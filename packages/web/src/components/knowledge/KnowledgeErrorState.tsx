'use client';

import React from 'react';

interface KnowledgeErrorStateProps {
  errorTitle: string;
  error: string;
  tryAgainLabel: string;
  onRetry: () => void;
}

export const KnowledgeErrorState = React.memo(function KnowledgeErrorState({
  errorTitle,
  error,
  tryAgainLabel,
  onRetry,
}: KnowledgeErrorStateProps) {
  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center" aria-hidden="true">
   <svg aria-hidden="true" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
   </svg>
   </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{errorTitle}</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <button type="button"
          onClick={onRetry}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors text-sm min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {tryAgainLabel}
        </button>
      </div>
    </div>
  );
});
