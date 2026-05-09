import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'reader-settings' });

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

function loadSettings(): ReaderSettings {
  try {
    const saved = storage.getString('settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: ReaderSettings): void {
  storage.set('settings', JSON.stringify(settings));
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  ...loadSettings(),

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
    try {
      const saved = storage.getString(`progress:${bookId}`);
      return saved ? JSON.parse(saved) : { chapterIndex: 0, scrollPercent: 0 };
    } catch {
      return { chapterIndex: 0, scrollPercent: 0 };
    }
  },

  saveProgress: (bookId: string, chapterIndex: number, scrollPercent: number) => {
    storage.set(`progress:${bookId}`, JSON.stringify({ chapterIndex, scrollPercent }));
    set({ currentChapterIndex: chapterIndex });
  },
}));
