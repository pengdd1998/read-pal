'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/auth-fetch';
import type { BookData } from '@/types/book';

interface StudyGuideCardProps {
  bookId: string;
  book: BookData;
  flashcardCount: number;
  totalAnnotations: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  onExportSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function StudyGuideCard({
  bookId,
  book,
  flashcardCount,
  totalAnnotations,
  t,
  onExportSuccess,
  onError,
}: StudyGuideCardProps) {
  const [generating, setGenerating] = useState(false);

  if (flashcardCount === 0 && totalAnnotations <= 5) return null;

  const handleExport = async () => {
    try {
      setGenerating(true);
      const res = await authFetch(`/api/v1/export/${bookId}/study_guide`);
      if (!res.ok) throw new Error('Export failed');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/markdown; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `study-guide-${book.title.replace(/\s+/g, '-')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      onExportSuccess(t('studyGuideExported'));
    } catch {
      onError(t('failedToExportStudyGuide'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded-2xl border border-indigo-200/50 dark:border-indigo-800/30 p-5 mb-6 animate-slide-up stagger-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{'📚'}</span>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t('studyGuide')}
          </h2>
          <p className="text-xs text-gray-500">{t('studyGuideDesc')}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleExport}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          {generating ? t('generating') : t('exportStudyGuide')}
        </button>
        {flashcardCount > 0 && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400">
            {flashcardCount === 1
              ? t('flashcardIncluded', { count: flashcardCount })
              : t('flashcardsIncluded', { count: flashcardCount })}
          </span>
        )}
      </div>
    </div>
  );
}
