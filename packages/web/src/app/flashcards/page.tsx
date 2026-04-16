'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface FlashcardData {
  id: string;
  question: string;
  answer: string;
  bookId: string;
  repetitionCount: number;
  nextReviewAt: string;
}

interface ReviewStats {
  total: number;
  due: number;
  reviewed: number;
}

const RATING_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Forgot', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  1: { label: 'Hard', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  2: { label: 'Difficult', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  3: { label: 'OK', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  4: { label: 'Good', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  5: { label: 'Easy', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
};

export default function FlashcardsPage() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ total: 0, due: 0, reviewed: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [completed, setCompleted] = useState(false);

  const currentCard = cards[currentIndex] as FlashcardData | undefined;

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ flashcards: FlashcardData[]; stats: ReviewStats }>('/api/flashcards/review?limit=20');
      if (res.success && res.data) {
        setCards(res.data.flashcards);
        setStats(res.data.stats);
        if (res.data.flashcards.length === 0) setCompleted(true);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleRate = async (rating: number) => {
    if (!currentCard) return;
    setReviewing(true);
    try {
      await api.post(`/api/flashcards/${currentCard.id}/review`, { rating });
      // Move to next card
      if (currentIndex + 1 >= cards.length) {
        setCompleted(true);
      } else {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false);
      }
    } catch {
      // Stay on current card on error
    }
    setReviewing(false);
  };

  // Loading state
  if (loading) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="mb-8">
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 animate-pulse" />
        </div>
        <div className="card">
          <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  // No cards state
  if (cards.length === 0 && !completed) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="mb-6">
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\uD83D\uDCC7'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Cards to Review</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
            Generate flashcards from your highlights and notes, then come back to review.
          </p>
          <Link
            href="/library"
            className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200"
          >
            Go to Library
          </Link>
        </div>
      </main>
    );
  }

  // Completed state
  if (completed) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\uD83C\uDF89'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Review Complete!</h2>
          <p className="text-sm text-gray-500 mb-6">
            You reviewed {cards.length} card{cards.length !== 1 ? 's' : ''} today. Come back tomorrow for more.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
            <button
              onClick={() => { setCompleted(false); setCurrentIndex(0); fetchCards(); }}
              className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              Review More
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-xs text-gray-400 font-medium tabular-nums">
          {currentIndex + 1} / {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-8">
        <div
          className="bg-gradient-to-r from-amber-400 to-teal-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${((currentIndex) / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      {currentCard && (
        <div className="mb-8 animate-scale-in" key={currentCard.id}>
          <div
            className={`card min-h-[240px] flex flex-col justify-center cursor-pointer transition-all duration-300 ${
              showAnswer ? 'ring-2 ring-teal-300 dark:ring-teal-700' : ''
            }`}
            onClick={() => setShowAnswer(!showAnswer)}
          >
            {/* Question */}
            <div className="text-center">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3 block">
                {showAnswer ? 'Answer' : 'Question'}
              </span>
              <p className="text-lg font-medium text-gray-900 dark:text-white leading-relaxed px-4">
                {showAnswer ? currentCard.answer : currentCard.question}
              </p>
            </div>

            {!showAnswer && (
              <p className="text-center text-xs text-gray-400 mt-6">Tap to reveal answer</p>
            )}
          </div>

          {/* Repetition indicator */}
          {currentCard.repetitionCount > 0 && (
            <div className="flex items-center justify-center gap-1 mt-3">
              <span className="text-[10px] text-gray-400">Reviewed {currentCard.repetitionCount} time{currentCard.repetitionCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Rating buttons — shown after revealing answer */}
      {showAnswer && (
        <div className="animate-slide-up">
          <p className="text-xs text-gray-400 text-center mb-3">How well did you remember?</p>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((rating) => {
              const { label, color } = RATING_LABELS[rating];
              return (
                <button
                  key={rating}
                  onClick={() => handleRate(rating)}
                  disabled={reviewing}
                  className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 ${color}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="mt-10 pt-6 border-t border-gray-100 dark:border-gray-800">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.due}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Due</div>
          </div>
          <div>
            <div className="text-lg font-bold text-teal-600 dark:text-teal-400">{stats.reviewed}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Reviewed</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-600 dark:text-gray-400">{stats.total}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
          </div>
        </div>
      </div>
    </main>
  );
}
