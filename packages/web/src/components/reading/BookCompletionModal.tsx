'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';

interface BookCompletionModalProps {
  bookId: string;
  bookTitle: string;
  totalHighlights: number;
  totalNotes: number;
  totalChapters: number;
  onClose: () => void;
}

export function BookCompletionModal({
  bookId,
  bookTitle,
  totalHighlights,
  totalNotes,
  totalChapters,
  onClose,
}: BookCompletionModalProps) {
  const t = useTranslations('reader');
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [showPersonalBookCTA, setShowPersonalBookCTA] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);

  const handleGeneratePersonalBook = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      await api.post(`/api/memory-books/${bookId}/generate`, {
        format: 'personal_book',
      });
      router.push(`/memory-books/${bookId}`);
    } catch {
      setGenerating(false);
      setGenError(t('completion_failed_generate'));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('completion_title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-scale-in text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('completion_title')}</h3>
        <p className="text-gray-500 mb-5">{t('completion_subtitle')} <strong>{bookTitle}</strong></p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalHighlights}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('completion_highlights')}</div>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalNotes}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('completion_notes')}</div>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
            <div className="text-xl font-bold text-violet-600 dark:text-violet-400">{totalChapters}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{t('completion_chapters')}</div>
          </div>
        </div>

        {showPersonalBookCTA && (totalHighlights > 0 || totalNotes > 0) && (
          <>
            <button
              onClick={handleGeneratePersonalBook}
              disabled={generating}
              className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 transition-all shadow-md disabled:opacity-60 mb-3"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('completion_creating_book')}
                </span>
              ) : (
                t('completion_create_book')
              )}
            </button>
            {genError && (
              <p className="text-xs text-red-500 mb-3">{genError}</p>
            )}
          </>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          {t('completion_keep_exploring')}
        </button>
      </div>
    </div>
  );
}
