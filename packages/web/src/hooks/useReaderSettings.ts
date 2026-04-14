'use client';

import { useState, useEffect } from 'react';

const SETTINGS_KEY_PREFIX = 'reader-settings';

interface ReaderSettings {
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  quietMode: boolean;
}

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
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [quietMode, setQuietMode] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    const saved = loadSettings(bookId);
    if (saved) {
      if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'sepia') {
        setTheme(saved.theme);
      }
      if (typeof saved.quietMode === 'boolean') setQuietMode(saved.quietMode);
    }
  }, [bookId]);

  // Persist settings when they change (after initial load)
  useEffect(() => {
    if (!loading) {
      saveSettings(bookId, { fontSize, theme, quietMode });
    }
  }, [bookId, fontSize, theme, quietMode, loading]);

  return { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode };
}
