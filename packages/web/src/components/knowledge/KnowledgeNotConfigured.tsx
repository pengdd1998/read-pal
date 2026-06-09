'use client';

import React from 'react';
import { useRouter } from '@/i18n/navigation';

interface KnowledgeNotConfiguredProps {
  setupTitle: string;
  setupDesc: string;
  setupRequired: string;
  setupInstructions: string;
  backToLibraryLabel: string;
}

export const KnowledgeNotConfigured = React.memo(function KnowledgeNotConfigured({
  setupTitle,
  setupDesc,
  setupRequired,
  setupInstructions,
  backToLibraryLabel,
}: KnowledgeNotConfiguredProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="text-5xl mb-4" aria-hidden="true">{'🧠'}</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{setupTitle}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{setupDesc}</p>
        <div className="bg-surface-0 rounded-xl border border-surface-3 p-4 text-sm text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">{setupRequired}</p>
          <p>{setupInstructions}</p>
        </div>
        <button
          onClick={() => router.push('/library')}
          className="mt-6 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {backToLibraryLabel}
        </button>
      </div>
    </div>
  );
});
