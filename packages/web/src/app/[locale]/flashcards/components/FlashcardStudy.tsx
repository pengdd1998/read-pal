'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface FlashcardData {
  id: string;
  question: string;
  answer: string;
  bookId: string;
  bookTitle: string;
  repetitionCount: number;
  nextReviewAt: string;
}

interface ReviewStats {
  total: number;
  due: number;
  reviewed: number;
}

// Anki-style 4 rating buttons mapped to SM-2 scale
const RATINGS: { value: number; labelKey: string; hint: string; color: string }[] = [
  { value: 0, labelKey: 'rating_again', hint: '1', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  { value: 2, labelKey: 'rating_hard', hint: '2', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  { value: 4, labelKey: 'rating_good', hint: '3', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { value: 5, labelKey: 'rating_easy', hint: '4', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
];

interface FlashcardStudyProps {
  cards: FlashcardData[];
  currentIndex: number;
  showAnswer: boolean;
  reviewing: boolean;
  stats: ReviewStats;
  onShowAnswer: (show: boolean) => void;
  onRate: (rating: number) => void;
  onBackToDecks: () => void;
}

export function FlashcardStudy({
  cards,
  currentIndex,
  showAnswer,
  reviewing,
  stats,
  onShowAnswer,
  onRate,
  onBackToDecks,
}: FlashcardStudyProps) {
  const t = useTranslations('flashcards');
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const currentCard = cards[currentIndex] as FlashcardData | undefined;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart || reviewing) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;

    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 2) {
      setTouchStart(null);
      return;
    }

    if (!showAnswer) {
      if (dx > 0) onShowAnswer(true);
    } else {
      onRate(dx > 0 ? 4 : 0);
    }
    setTouchStart(null);
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
      <h1 className="sr-only">{t('page_title')}</h1>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBackToDecks}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('decks_label')}
        </button>
        <span className="text-xs text-gray-400 font-medium tabular-nums">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-8">
        <div
          className="bg-gradient-to-r from-amber-400 to-teal-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${(currentIndex / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      {currentCard && (
        <div className="mb-8 animate-scale-in" key={currentCard.id}>
          {currentCard.bookTitle && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-xs">{'\uD83D\uDCD6'}</span>
              <span className="text-xs text-gray-400 truncate">{currentCard.bookTitle}</span>
            </div>
          )}

          <div
            className={`card min-h-[240px] flex flex-col justify-center cursor-pointer transition-all duration-300 ${
              showAnswer ? 'ring-2 ring-teal-300 dark:ring-teal-700' : ''
            }`}
            onClick={() => onShowAnswer(!showAnswer)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="region"
            aria-live="polite"
            aria-label={showAnswer ? t('answer_label') : t('question_label')}
          >
            <div className="text-center">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3 block">
                {showAnswer ? t('answer_label') : t('question_label')}
              </span>
              <p className="text-lg font-medium text-gray-900 dark:text-white leading-relaxed px-4">
                {showAnswer ? currentCard.answer : currentCard.question}
              </p>
            </div>

            {!showAnswer && (
              <p className="text-center text-xs text-gray-400 mt-6">{t('tap_to_reveal')}</p>
            )}
          </div>

          {currentCard.repetitionCount > 0 && (
            <div className="flex items-center justify-center gap-1 mt-3">
              <span className="text-[10px] text-gray-400">{t('reviewed_times', { count: currentCard.repetitionCount })}</span>
            </div>
          )}
        </div>
      )}

      {/* Rating buttons */}
      {showAnswer && (
        <div className="animate-slide-up">
          <p className="text-xs text-gray-400 text-center mb-3">{t('how_well')} <span className="hidden sm:inline text-gray-300">{t('keys_hint')}</span></p>
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map(({ value, labelKey, hint, color }) => (
              <button
                key={value}
                onClick={() => onRate(value)}
                disabled={reviewing}
                className={`flex flex-col items-center gap-0.5 px-1 py-3 rounded-xl text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${color}`}
              >
                <span>{t(labelKey)}</span>
                <span className="text-[9px] opacity-50 font-mono">{hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.due}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('due_label')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{stats.reviewed}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('reviewed_label')}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-600 dark:text-gray-400">{stats.total}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{t('total_label')}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
