'use client';

import React from 'react';
import { useRouter } from '@/i18n/navigation';

interface KnowledgeEmptyStateProps {
  buildingTitle: string;
  buildingDesc: string;
  tipHighlight: string;
  tipAnnotate: string;
  tipChat: string;
  startReadingLabel: string;
}

export const KnowledgeEmptyState = React.memo(function KnowledgeEmptyState({
  buildingTitle,
  buildingDesc,
  tipHighlight,
  tipAnnotate,
  tipChat,
  startReadingLabel,
}: KnowledgeEmptyStateProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        {/* Decorative mini-graph preview */}
        <div className="mx-auto mb-6 w-48 h-36 relative opacity-30">
          <svg aria-hidden="true" viewBox="0 0 200 140" className="w-full h-full">
            <line x1="60" y1="40" x2="120" y2="70" stroke="var(--gray-400)" strokeWidth="1.5" />
            <line x1="120" y1="70" x2="80" y2="110" stroke="var(--gray-400)" strokeWidth="1.5" />
            <line x1="60" y1="40" x2="150" y2="35" stroke="var(--gray-400)" strokeWidth="1.5" />
            <line x1="120" y1="70" x2="160" y2="100" stroke="var(--gray-400)" strokeWidth="1.5" />
            <line x1="80" y1="110" x2="40" y2="80" stroke="var(--gray-400)" strokeWidth="1.5" />
            <circle cx="60" cy="40" r="12" fill="#0d9488" opacity="0.6" />
            <circle cx="120" cy="70" r="16" fill="#7c3aed" opacity="0.6" />
            <circle cx="80" cy="110" r="10" fill="#ea580c" opacity="0.6" />
            <circle cx="150" cy="35" r="8" fill="#2563eb" opacity="0.6" />
            <circle cx="160" cy="100" r="10" fill="#059669" opacity="0.6" />
            <circle cx="40" cy="80" r="8" fill="#d97706" opacity="0.6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">{buildingTitle}</h1>
        <p className="text-gray-600 mb-6">{buildingDesc}</p>
        <div className="bg-surface-0 rounded-xl border border-surface-3 p-4 text-sm text-gray-500 mb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
              <span>{tipHighlight}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              <span>{tipAnnotate}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{tipChat}</span>
            </div>
          </div>
        </div>
        <button type="button"
          onClick={() => router.push('/library')}
          className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {startReadingLabel}
        </button>
      </div>
    </div>
  );
});
