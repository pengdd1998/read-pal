'use client';

import { useState, useEffect, useRef } from 'react';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { warn } from '@/lib/logger';

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
  lineHeight: 1.9,
};

function loadSettings(bookId: string): ReaderSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeGetItem(`${SETTINGS_KEY_PREFIX}-${bookId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    warn("useReaderSettings: failed to load settings", err);
    return null;
  }
}

function saveSettings(bookId: string, settings: ReaderSettings) {
  if (typeof window === 'undefined') return;
  try {
    safeSetItem(`${SETTINGS_KEY_PREFIX}-${bookId}`, JSON.stringify(settings));
  } catch (err) {
    warn("useReaderSettings: failed to save settings", err);
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

  // Persist settings when they change (debounced for slider perf)
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (loading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveSettings(bookId, { fontSize, theme, quietMode, fontFamily, lineHeight });
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [bookId, fontSize, theme, quietMode, fontFamily, lineHeight, loading]);

  return { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight };
}

export { FONT_FAMILIES, DEFAULT_SETTINGS };
