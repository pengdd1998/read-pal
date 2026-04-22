'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface FlashcardEmptyProps {
  variant: 'no-decks' | 'all-caught-up' | 'review-complete';
  reviewedCount?: number;
  onBackToDecks: () => void;
}

export function FlashcardEmpty({ variant, reviewedCount = 0, onBackToDecks }: FlashcardEmptyProps) {
  const t = useTranslations('flashcards');

  if (variant === 'no-decks') {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <h1 className="sr-only">{t('page_title')}</h1>
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('back_to_decks')}
          </button>
        </div>

        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\uD83D\uDCC7'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('empty_title')}</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            {t('empty_desc')}
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto mb-6 text-left">
            {([1, 2, 3] as const).map((step) => (
              <div key={step} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {step}
                </span>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t(`empty_step${step}` as 'empty_step1' | 'empty_step2' | 'empty_step3')}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/library"
            className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
          >
            {t('go_to_library')}
          </Link>
        </div>
      </main>
    );
  }

  if (variant === 'review-complete') {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <h1 className="sr-only">{t('page_title')}</h1>
        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\uD83C\uDF89'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('review_complete_title')}</h2>
          <p className="text-sm text-gray-500 mb-6">
            {t('review_complete_desc', { count: reviewedCount })}
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="btn btn-primary">{t('dashboard')}</Link>
            <button
              onClick={onBackToDecks}
              className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              {t('back_to_decks')}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // all-caught-up
  return (
    <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
      <h1 className="sr-only">{t('page_title')}</h1>
      <div className="card text-center py-16">
        <span className="text-5xl block mb-4">{'\u2705'}</span>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('all_caught_up')}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t('all_caught_up_desc')}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onBackToDecks}
            className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
          >
            {t('back_to_decks')}
          </button>
          <Link href="/dashboard" className="btn btn-primary">{t('dashboard')}</Link>
        </div>
      </div>
    </main>
  );
}
