/**
 * Reader theme class maps.
 *
 * Centralised so both ReaderView and the page-level wrapper
 * can reference the same tailwind classes.
 */

export type ReaderTheme = 'light' | 'dark' | 'sepia';

export const themeClasses: Record<ReaderTheme, string> = {
  light: 'bg-white text-gray-800',
  dark: 'bg-gray-950 text-gray-200',
  sepia: 'bg-[#f8f4ec] text-[#5c4b37]',
};

export const progressBg: Record<ReaderTheme, string> = {
  light: 'bg-gray-100',
  dark: 'bg-gray-800',
  sepia: 'bg-amber-100/60',
};

export const progressFill: Record<ReaderTheme, string> = {
  light: 'bg-gradient-to-r from-teal-500 to-amber-400',
  dark: 'bg-gradient-to-r from-teal-400 to-amber-400',
  sepia: 'bg-gradient-to-r from-amber-600 to-amber-400',
};

/** Page-level theme classes (slightly different from reader-internal classes). */
export const pageThemeClasses: Record<ReaderTheme, string> = {
  light: 'bg-[#fefdfb] text-gray-900',
  dark: 'bg-[#0c0a09] text-gray-100',
  sepia: 'bg-[#f5f0e4] text-amber-900',
};
