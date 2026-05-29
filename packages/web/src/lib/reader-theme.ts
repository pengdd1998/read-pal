/**
 * Reader theme class maps.
 *
 * Centralised so both ReaderView and the page-level wrapper
 * can reference the same tailwind classes.
 */

export type ReaderTheme = 'light' | 'dark' | 'sepia';

export const themeClasses: Record<ReaderTheme, string> = {
  light: 'bg-white text-gray-800',
  dark: 'bg-gray-900 text-gray-200',
  sepia: 'bg-[#faf6f0] text-[#5c4b37]',
};

export const progressBg: Record<ReaderTheme, string> = {
  light: 'bg-gray-200',
  dark: 'bg-gray-700',
  sepia: 'bg-amber-200/60',
};

export const progressFill: Record<ReaderTheme, string> = {
  light: 'bg-gradient-to-r from-teal-500 to-amber-500',
  dark: 'bg-gradient-to-r from-teal-400 to-amber-400',
  sepia: 'bg-gradient-to-r from-amber-600 to-amber-400',
};

/** Page-level theme classes (slightly different from reader-internal classes). */
export const pageThemeClasses: Record<ReaderTheme, string> = {
  light: 'bg-[#fefdfb] text-gray-900',
  dark: 'bg-[#1a1410] text-gray-100',
  sepia: 'bg-[#f8f4ec] text-amber-900',
};
