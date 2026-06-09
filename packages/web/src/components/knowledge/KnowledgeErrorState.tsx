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
        <div className="text-5xl mb-4" aria-hidden="true">{'⚠️'}</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{errorTitle}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <button
          onClick={onRetry}
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl transition-colors text-sm min-h-[44px]"
        >
          {tryAgainLabel}
        </button>
      </div>
    </div>
  );
});
