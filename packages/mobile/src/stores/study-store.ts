import { create } from 'zustand';

interface ReviewResult {
  cardId: string;
  rating: number;
}

interface StudyState {
  currentBookId: string | null;
  cardsRemaining: number;
  cardsReviewed: number;
  totalCards: number;
  reviewResults: ReviewResult[];
  sessionActive: boolean;
  startSession: (bookId: string, totalCards: number) => void;
  addReview: (cardId: string, rating: number) => void;
  setCardsRemaining: (count: number) => void;
  clearSession: () => void;
}

export const useStudyStore = create<StudyState>((set) => ({
  currentBookId: null,
  cardsRemaining: 0,
  cardsReviewed: 0,
  totalCards: 0,
  reviewResults: [],
  sessionActive: false,

  startSession: (bookId: string, totalCards: number) => {
    set({
      currentBookId: bookId,
      totalCards,
      cardsRemaining: totalCards,
      cardsReviewed: 0,
      reviewResults: [],
      sessionActive: true,
    });
  },

  addReview: (cardId: string, rating: number) => {
    set((state) => ({
      reviewResults: [...state.reviewResults, { cardId, rating }],
      cardsReviewed: state.cardsReviewed + 1,
      cardsRemaining: Math.max(0, state.cardsRemaining - 1),
    }));
  },

  setCardsRemaining: (count: number) => set({ cardsRemaining: count }),

  clearSession: () => {
    set({
      currentBookId: null,
      cardsRemaining: 0,
      cardsReviewed: 0,
      totalCards: 0,
      reviewResults: [],
      sessionActive: false,
    });
  },
}));
