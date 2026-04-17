'use client';

import { useState, useEffect } from 'react';

const SETTINGS_KEY_PREFIX = 'reader-settings';

interface ReaderSettings {
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  quietMode: boolean;
  fontFamily: string;
  lineHeight: number;
}

const FONT_FAMILIES = [
  { value: 'system-ui', label: 'System' },
  { value: "'Literata', 'Source Serif 4', Georgia, serif", label: 'Serif' },
  { value: "'Inter', system-ui, sans-serif", label: 'Sans-serif' },
  { value: "'Merriweather', Georgia, serif", label: 'Merriweather' },
] as const;

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  theme: 'light',
  quietMode: false,
  fontFamily: "'Literata', 'Source Serif 4', Georgia, serif",
  lineHeight: 1.85,
};

function loadSettings(bookId: string): ReaderSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY_PREFIX}-${bookId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(bookId: string, settings: ReaderSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SETTINGS_KEY_PREFIX}-${bookId}`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useReaderSettings(bookId: string, loading: boolean) {
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.fontSize);
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>(DEFAULT_SETTINGS.theme);
  const [quietMode, setQuietMode] = useState(DEFAULT_SETTINGS.quietMode);
  const [fontFamily, setFontFamily] = useState(DEFAULT_SETTINGS.fontFamily);
  const [lineHeight, setLineHeight] = useState(DEFAULT_SETTINGS.lineHeight);

  // Load saved settings on mount
  useEffect(() => {
    const saved = loadSettings(bookId);
    if (saved) {
      if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'sepia') {
        setTheme(saved.theme);
      }
      if (typeof saved.quietMode === 'boolean') setQuietMode(saved.quietMode);
      if (typeof saved.fontFamily === 'string') setFontFamily(saved.fontFamily);
      if (typeof saved.lineHeight === 'number') setLineHeight(saved.lineHeight);
    }
  }, [bookId]);

  // Persist settings when they change (after initial load)
  useEffect(() => {
    if (!loading) {
      saveSettings(bookId, { fontSize, theme, quietMode, fontFamily, lineHeight });
    }
  }, [bookId, fontSize, theme, quietMode, fontFamily, lineHeight, loading]);

  return { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight };
}

export { FONT_FAMILIES, DEFAULT_SETTINGS };
