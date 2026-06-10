import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PersonaKey } from '@/lib/personas';

const COMPANION_KEY = 'companion-settings';

interface CompanionState {
  selectedPersona: PersonaKey;
  relationshipLevel: number;
  lastGreeting: string;
  lastGreetingDate: string | null;
  initialized: boolean;
  setPersona: (persona: PersonaKey) => void;
  setRelationshipLevel: (level: number) => void;
  setGreeting: (text: string) => void;
  initialize: () => Promise<void>;
}

export const useCompanionStore = create<CompanionState>((set, get) => {
  AsyncStorage.getItem(COMPANION_KEY)
    .then((saved: string | null) => {
      if (saved) {
        const parsed = JSON.parse(saved);
        set({ ...parsed, initialized: true });
      } else {
        set({ initialized: true });
      }
    })
    .catch(() => set({ initialized: true }));

  const persist = () => {
    const { selectedPersona, relationshipLevel, lastGreeting, lastGreetingDate } = get();
    AsyncStorage.setItem(
      COMPANION_KEY,
      JSON.stringify({ selectedPersona, relationshipLevel, lastGreeting, lastGreetingDate }),
    ).catch(() => {});
  };

  return {
    selectedPersona: 'sage',
    relationshipLevel: 0,
    lastGreeting: '',
    lastGreetingDate: null,
    initialized: false,

    setPersona: (persona: PersonaKey) => {
      set({ selectedPersona: persona });
      persist();
    },

    setRelationshipLevel: (level: number) => {
      set({ relationshipLevel: level });
      persist();
    },

    setGreeting: (text: string) => {
      set({ lastGreeting: text, lastGreetingDate: new Date().toISOString() });
      persist();
    },

    initialize: async () => {
      const saved = await AsyncStorage.getItem(COMPANION_KEY);
      if (saved) {
        set({ ...JSON.parse(saved), initialized: true });
      } else {
        set({ initialized: true });
      }
    },
  };
});
