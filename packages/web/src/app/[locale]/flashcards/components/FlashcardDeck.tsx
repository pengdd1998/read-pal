'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface DeckInfo {
  bookId: string;
  bookTitle: string;
  author: string;
  coverUrl?: string;
  total: number;
  due: number;
}

interface FlashcardDeckProps {
  decks: DeckInfo[];
  totalCards: number;
  totalDue: number;
  onStartReview: (bookId: string | null) => void;
}

export function FlashcardDeck({ decks, totalCards, totalDue, onStartReview }: FlashcardDeckProps) {
  const t = useTranslations('flashcards');

  return (
    <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
      <h1 className="sr-only">{t('page_title')}</h1>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('back_to_decks')}
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('page_title')}</span>
      </div>

      {/* Total stats */}
      <div className="card mb-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{totalDue}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('due_label')}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">{totalCards - totalDue}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('reviewed_label')}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{totalCards}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('total_label')}</div>
          </div>
        </div>
      </div>

      {/* Review All button */}
      {totalDue > 0 && (
        <button
          onClick={() => onStartReview(null)}
          className="w-full btn btn-primary mb-6 hover:scale-[1.01] active:scale-[0.99] transition-transform duration-200"
        >
          {t('review_all', { count: totalDue })}
        </button>
      )}

      {/* Deck list */}
      <div className="space-y-3">
        {decks.map((deck) => (
          <button
            key={deck.bookId}
            onClick={() => deck.due > 0 ? onStartReview(deck.bookId) : undefined}
            className={`w-full card text-left group transition-all duration-200 ${
              deck.due > 0
                ? 'hover:border-teal-200 dark:hover:border-teal-800 hover:shadow-sm cursor-pointer'
                : 'opacity-70'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {deck.coverUrl ? (
                  <img src={deck.coverUrl} alt={t('cover_alt', { title: deck.bookTitle })} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-lg">{'\uD83D\uDCD6'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {deck.bookTitle}
                </h3>
                <p className="text-xs text-gray-400 truncate">{deck.author}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">{t('cards_count', { count: deck.total })}</span>
                  {deck.due > 0 ? (
                    <span className="text-xs font-medium text-teal-600 dark:text-teal-400">{t('due_count', { count: deck.due })}</span>
                  ) : (
                    <span className="text-xs text-emerald-500 flex items-center gap-0.5">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {t('done_label')}
                    </span>
                  )}
                </div>
              </div>
              {deck.due > 0 && (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                  {t('review_button')}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
