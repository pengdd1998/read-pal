'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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

interface DeckInfo {
  bookId: string;
  bookTitle: string;
  author: string;
  coverUrl?: string;
  total: number;
  due: number;
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
  const [mode, setMode] = useState<'decks' | 'review'>('decks');
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [deckTotalCards, setDeckTotalCards] = useState(0);
  const [deckTotalDue, setDeckTotalDue] = useState(0);
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ total: 0, due: 0, reviewed: 0 });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [filterBookId, setFilterBookId] = useState<string | null>(null);

  const currentCard = cards[currentIndex] as FlashcardData | undefined;

  const fetchDecks = useCallback(async () => {
    try {
      const res = await api.get<{ decks: DeckInfo[]; totalCards: number; totalDue: number }>('/api/flashcards/decks');
      if (res.success && res.data) {
        setDecks(res.data.decks);
        setDeckTotalCards(res.data.totalCards);
        setDeckTotalDue(res.data.totalDue);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchCards = useCallback(async (bookId?: string | null) => {
    setLoading(true);
    try {
      const url = bookId
        ? `/api/flashcards/review?limit=20&bookId=${bookId}`
        : '/api/flashcards/review?limit=20';
      const res = await api.get<{ flashcards: FlashcardData[]; stats: ReviewStats }>(url);
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

  // Initial load: fetch decks
  useEffect(() => {
    fetchDecks().finally(() => setLoading(false));
  }, [fetchDecks]);

  const startReview = async (bookId?: string | null) => {
    setFilterBookId(bookId ?? null);
    setMode('review');
    setCompleted(false);
    setCurrentIndex(0);
    setShowAnswer(false);
    await fetchCards(bookId);
  };

  const handleRate = async (rating: number) => {
    if (!currentCard) return;
    setReviewing(true);
    try {
      await api.post(`/api/flashcards/${currentCard.id}/review`, { rating });
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
  if (loading && mode === 'decks') {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="mb-8">
          <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded-lg w-40 animate-pulse" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="flex items-center gap-3">
                <div className="w-10 h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (loading && mode === 'review') {
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

  // Empty state — no cards at all
  if (mode === 'decks' && decks.length === 0) {
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Cards Yet</h2>
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

  // Review completed
  if (mode === 'review' && completed) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\uD83C\uDF89'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Review Complete!</h2>
          <p className="text-sm text-gray-500 mb-6">
            You reviewed {cards.length} card{cards.length !== 1 ? 's' : ''}. Come back tomorrow for more.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
            <button
              onClick={() => { setMode('decks'); setCompleted(false); setCurrentIndex(0); fetchDecks(); }}
              className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              Back to Decks
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Review mode — no due cards
  if (mode === 'review' && cards.length === 0 && !completed) {
    return (
      <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
        <div className="card text-center py-16">
          <span className="text-5xl block mb-4">{'\u2705'}</span>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">All Caught Up!</h2>
          <p className="text-sm text-gray-500 mb-6">
            No cards are due for review right now. Come back later.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setMode('decks'); fetchDecks(); }}
              className="btn bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              Back to Decks
            </button>
            <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
          </div>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DECK OVERVIEW MODE
  // ═══════════════════════════════════════════════════════════════
  if (mode === 'decks') {
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
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Flashcards</span>
        </div>

        {/* Total stats */}
        <div className="card mb-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{deckTotalDue}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Due</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">{deckTotalCards - deckTotalDue}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Reviewed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{deckTotalCards}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Total</div>
            </div>
          </div>
        </div>

        {/* Review All button */}
        {deckTotalDue > 0 && (
          <button
            onClick={() => startReview(null)}
            className="w-full btn btn-primary mb-6 hover:scale-[1.01] active:scale-[0.99] transition-transform duration-200"
          >
            Review All ({deckTotalDue} due)
          </button>
        )}

        {/* Deck list */}
        <div className="space-y-3">
          {decks.map((deck) => (
            <button
              key={deck.bookId}
              onClick={() => deck.due > 0 ? startReview(deck.bookId) : undefined}
              className={`w-full card text-left group transition-all duration-200 ${
                deck.due > 0
                  ? 'hover:border-teal-200 dark:hover:border-teal-800 hover:shadow-sm cursor-pointer'
                  : 'opacity-70'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-14 rounded-lg bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/20 dark:to-teal-900/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {deck.coverUrl ? (
                    <img src={deck.coverUrl} alt="" className="w-full h-full object-cover rounded-lg" />
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
                    <span className="text-xs text-gray-500">{deck.total} cards</span>
                    {deck.due > 0 ? (
                      <span className="text-xs font-medium text-teal-600 dark:text-teal-400">{deck.due} due</span>
                    ) : (
                      <span className="text-xs text-emerald-500 flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Done
                      </span>
                    )}
                  </div>
                </div>
                {deck.due > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500 text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0">
                    Review
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

  // ═══════════════════════════════════════════════════════════════
  // REVIEW MODE
  // ═══════════════════════════════════════════════════════════════
  return (
    <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => { setMode('decks'); fetchDecks(); }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Decks
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
          {/* Book context */}
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
