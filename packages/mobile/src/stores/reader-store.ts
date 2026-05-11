import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'reader-settings';

export type ReaderTheme = 'light' | 'dark' | 'sepia';

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  theme: ReaderTheme;
  currentBookId: string | null;
  currentChapterIndex: number;
}

interface ReaderState extends ReaderSettings {
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setFontFamily: (family: string) => void;
  setTheme: (theme: ReaderTheme) => void;
  setCurrentBook: (bookId: string | null, chapterIndex?: number) => void;
  getProgress: (bookId: string) => { chapterIndex: number; scrollPercent: number };
  saveProgress: (bookId: string, chapterIndex: number, scrollPercent: number) => void;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 1.75,
  fontFamily: 'Literata',
  theme: 'light',
  currentBookId: null,
  currentChapterIndex: 0,
};

export const useReaderStore = create<ReaderState>((set, get) => {
  // Load settings asynchronously (non-blocking)
  AsyncStorage.getItem(SETTINGS_KEY)
    .then(saved => {
      if (saved) {
        set({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    })
    .catch(() => {
      // Use defaults on error
    });

  // Persist settings helper
  const persistSettings = (settings: ReaderSettings) => {
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {
      // Silently fail
    });
  };

  return {
    ...DEFAULT_SETTINGS,

    setFontSize: (fontSize: number) => {
      const state = { ...get(), fontSize };
      persistSettings(state);
      set({ fontSize });
    },

    setLineHeight: (lineHeight: number) => {
      const state = { ...get(), lineHeight };
      persistSettings(state);
      set({ lineHeight });
    },

    setFontFamily: (fontFamily: string) => {
      const state = { ...get(), fontFamily };
      persistSettings(state);
      set({ fontFamily });
    },

    setTheme: (theme: ReaderTheme) => {
      const state = { ...get(), theme };
      persistSettings(state);
      set({ theme });
    },

    setCurrentBook: (bookId, chapterIndex = 0) => {
      set({ currentBookId: bookId, currentChapterIndex: chapterIndex });
    },

    getProgress: (bookId: string) => {
      // Return defaults immediately, will be updated async
      const result = { chapterIndex: 0, scrollPercent: 0 };

      // Load asynchronously (fire and forget)
      AsyncStorage.getItem(`progress:${bookId}`)
        .then(saved => {
          if (saved) {
            return JSON.parse(saved);
          }
          return result;
        })
        .catch(() => result);

      return result;
    },

    saveProgress: (bookId: string, chapterIndex: number, scrollPercent: number) => {
      AsyncStorage.setItem(`progress:${bookId}`, JSON.stringify({ chapterIndex, scrollPercent })).catch(
        () => {
          // Silently fail
        }
      );
      set({ currentChapterIndex: chapterIndex });
    },
  };
});
