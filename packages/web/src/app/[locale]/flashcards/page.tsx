'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FlashcardDeck } from './components/FlashcardDeck';
import { FlashcardStudy } from './components/FlashcardStudy';
import { FlashcardEmpty } from './components/FlashcardEmpty';

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

export default function FlashcardsPage() {
 const t = useTranslations('flashcards');
 usePageTitle(t('page_title'));

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
 const [toast, setToast] = useState<string | null>(null);
 const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const mountedRef = useRef(true);

 useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
 useEffect(() => { return () => { mountedRef.current = false; }; }, []);

 const fetchDecks = useCallback(async () => {
 try {
  const res = await api.get<{ decks: DeckInfo[]; totalCards: number; totalDue: number }>('/api/flashcards/decks');
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setDecks(res.data.decks);
  setDeckTotalCards(res.data.totalCards);
  setDeckTotalDue(res.data.totalDue);
  }
 } catch (err) {
  if (!mountedRef.current) return;
  console.warn('FlashcardsPage: fetchDecks failed', err);
  setToast(t('toast_load_decks'));
  { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast(null), 3000); }
 }
 }, [t]);

 const fetchCards = useCallback(async (bookId?: string | null) => {
 setLoading(true);
 try {
  const url = bookId
  ? `/api/flashcards/review?limit=20&bookId=${bookId}`
  : '/api/flashcards/review?limit=20';
  const res = await api.get<{ flashcards: FlashcardData[]; stats: ReviewStats }>(url);
  if (!mountedRef.current) return;
  if (res.success && res.data) {
  setCards(res.data.flashcards);
  setStats(res.data.stats);
  if (res.data.flashcards.length === 0) setCompleted(true);
  }
 } catch (err) {
  if (!mountedRef.current) return;
  console.warn('FlashcardsPage: fetchCards failed', err);
  setToast(t('toast_load_cards'));
  { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast(null), 3000); }
 }
 if (mountedRef.current) setLoading(false);
 }, [t]);

 useEffect(() => {
 let stale = false;
 fetchDecks().finally(() => { if (!stale) setLoading(false); });
 const onFocus = () => { fetchDecks(); };
 window.addEventListener('focus', onFocus);
 return () => { stale = true; window.removeEventListener('focus', onFocus); };
 }, [fetchDecks]);

 const handleRate = useCallback(async (rating: number) => {
 const card = cards[currentIndex];
 if (!card) return;
 setReviewing(true);
 try {
  await api.post(`/api/flashcards/${card.id}/review`, { rating });
  if (!mountedRef.current) return;
  if (currentIndex + 1 >= cards.length) {
  setCompleted(true);
  } else {
  setCurrentIndex(currentIndex + 1);
  setShowAnswer(false);
  }
 } catch (err) {
  if (!mountedRef.current) return;
  console.warn('FlashcardsPage: handleRate failed', err);
  setToast(t('toast_save_review'));
  { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); toastTimerRef.current = setTimeout(() => setToast(null), 3000); }
 }
 if (mountedRef.current) setReviewing(false);
 }, [cards, currentIndex, t]);

 // Keyboard shortcuts for review mode
 useEffect(() => {
 if (mode !== 'review' || !cards[currentIndex] || reviewing) return;

 const handleKey = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.key === ' ' || e.key === 'Enter') {
  e.preventDefault();
  setShowAnswer((prev) => !prev);
  } else if (showAnswer) {
  const keyMap: Record<string, number> = { '1': 0, '2': 3, '3': 4, '4': 5 };
  if (keyMap[e.key] !== undefined) {
   handleRate(keyMap[e.key]);
  }
  }
 };

 window.addEventListener('keydown', handleKey);
 return () => window.removeEventListener('keydown', handleKey);
 }, [mode, cards, currentIndex, showAnswer, reviewing, handleRate]);

 const startReview = async (bookId?: string | null) => {
 setCompleted(false);
 setCurrentIndex(0);
 setShowAnswer(false);
 await fetchCards(bookId);
 if (!mountedRef.current) return;
 setMode('review');
 };

 const backToDecks = () => {
 setMode('decks');
 setCompleted(false);
 setCurrentIndex(0);
 fetchDecks();
 };

 const toastEl = toast ? (
 <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium shadow-lg animate-fade-in">
  {toast}
 </div>
 ) : null;

 // Loading states
 if (loading && mode === 'decks') {
 return (
  <>
  {toastEl}
  <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
   <div className="mb-8">
   <div className="h-7 bg-surface-2 rounded-lg w-40 animate-pulse" />
   </div>
   <div className="space-y-3">
   {[1, 2, 3].map((i) => (
    <div key={i} className="card">
    <div className="flex items-center gap-3">
     <div className="w-10 h-14 bg-surface-1 rounded-lg animate-pulse" />
     <div className="flex-1">
     <div className="h-4 bg-surface-1 rounded w-3/4 animate-pulse mb-2" />
     <div className="h-3 bg-surface-1 rounded w-1/2 animate-pulse" />
     </div>
    </div>
    </div>
   ))}
   </div>
  </main>
  </>
 );
 }

 if (loading && mode === 'review') {
 return (
  <>
  {toastEl}
  <main className="max-w-lg mx-auto px-4 py-12 animate-fade-in">
   <div className="mb-8">
   <div className="h-7 bg-surface-2 rounded-lg w-40 animate-pulse" />
   </div>
   <div className="card">
   <div className="h-48 bg-surface-1 rounded-xl animate-pulse" />
   </div>
  </main>
  </>
 );
 }

 // Empty state — no decks
 if (mode === 'decks' && decks.length === 0) {
 return <>{toastEl}<FlashcardEmpty variant="no-decks" onBackToDecks={backToDecks} /></>;
 }

 // Review completed
 if (mode === 'review' && completed) {
 return <>{toastEl}<FlashcardEmpty variant="review-complete" reviewedCount={cards.length} onBackToDecks={backToDecks} /></>;
 }

 // No due cards
 if (mode === 'review' && cards.length === 0 && !completed) {
 return <>{toastEl}<FlashcardEmpty variant="all-caught-up" onBackToDecks={backToDecks} /></>;
 }

 // Deck overview
 if (mode === 'decks') {
 return (
  <>
  {toastEl}
  <FlashcardDeck
   decks={decks}
   totalCards={deckTotalCards}
   totalDue={deckTotalDue}
   onStartReview={startReview}
  />
  </>
 );
 }

 // Review mode
 return (
 <>
  {toastEl}
  <FlashcardStudy
  cards={cards}
  currentIndex={currentIndex}
  showAnswer={showAnswer}
  reviewing={reviewing}
  stats={stats}
  onShowAnswer={setShowAnswer}
  onRate={handleRate}
  onBackToDecks={backToDecks}
  />
 </>
 );
}
