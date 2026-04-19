import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReaderSettings, DEFAULT_SETTINGS } from '../useReaderSettings';

describe('useReaderSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default settings initially', () => {
    const { result } = renderHook(() => useReaderSettings('book-1', false));

    expect(result.current.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(result.current.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.current.quietMode).toBe(DEFAULT_SETTINGS.quietMode);
    expect(result.current.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(result.current.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);
  });

  it('persists settings to localStorage', () => {
    const { result } = renderHook(() => useReaderSettings('book-1', false));

    act(() => {
      result.current.setFontSize(22);
    });

    // Setting should be updated
    expect(result.current.fontSize).toBe(22);

    // Should be in localStorage
    const stored = JSON.parse(
      localStorage.getItem('reader-settings-book-1') || '{}',
    );
    expect(stored.fontSize).toBe(22);
  });

  it('loads settings from localStorage on mount', () => {
    localStorage.setItem(
      'reader-settings-book-1',
      JSON.stringify({
        fontSize: 24,
        theme: 'dark',
        quietMode: true,
        fontFamily: 'system-ui',
        lineHeight: 1.5,
      }),
    );

    const { result } = renderHook(() => useReaderSettings('book-1', false));

    expect(result.current.fontSize).toBe(24);
    expect(result.current.theme).toBe('dark');
    expect(result.current.quietMode).toBe(true);
  });

  it('does not persist while loading', () => {
    const { result } = renderHook(() => useReaderSettings('book-1', true));

    act(() => {
      result.current.setFontSize(30);
    });

    // Setting updated in state
    expect(result.current.fontSize).toBe(30);

    // But NOT persisted to localStorage (loading=true)
    const stored = localStorage.getItem('reader-settings-book-1');
    expect(stored).toBeNull();
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem('reader-settings-book-1', 'not-json');

    const { result } = renderHook(() => useReaderSettings('book-1', false));

    // Falls back to defaults
    expect(result.current.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });

  it('updates theme correctly', () => {
    const { result } = renderHook(() => useReaderSettings('book-1', false));

    act(() => {
      result.current.setTheme('sepia');
    });

    expect(result.current.theme).toBe('sepia');
  });

  it('uses separate settings per book', () => {
    localStorage.setItem(
      'reader-settings-book-a',
      JSON.stringify({ ...DEFAULT_SETTINGS, fontSize: 20 }),
    );
    localStorage.setItem(
      'reader-settings-book-b',
      JSON.stringify({ ...DEFAULT_SETTINGS, fontSize: 28 }),
    );

    const { result: resultA } = renderHook(() => useReaderSettings('book-a', false));
    const { result: resultB } = renderHook(() => useReaderSettings('book-b', false));

    expect(resultA.current.fontSize).toBe(20);
    expect(resultB.current.fontSize).toBe(28);
  });
});
