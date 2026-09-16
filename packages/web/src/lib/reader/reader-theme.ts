/**
 * Reader theme class maps.
 *
 * Centralised so both ReaderView and the page-level wrapper
 * can reference the same tailwind classes.
 */

export type ReaderTheme = 'light' | 'dark' | 'sepia';

export const themeClasses: Record<ReaderTheme, string> = {
  // Literal (non-var) colors so the reader theme is independent of the app's
  // dark-mode gray inversion: bg-gray-* / text-gray-* are mapped to CSS vars
  // that FLIP in dark mode, which made the dark reader theme render a light
  // background with light text (invisible). Use the `reading` palette + raw
  // hex for both bg and text so each reader theme is self-consistent.
  light: 'bg-[#fefdfb] text-[#374151]', // warm paper — pure white is banned (DESIGN.md)
  dark: 'bg-reading-dark text-[#e5e7eb]',
  sepia: 'bg-[#f8f4ec] text-[#5c4b37]',
};

export const progressBg: Record<ReaderTheme, string> = {
  light: 'bg-gray-100',
  dark: 'bg-gray-800',
  sepia: 'bg-amber-100/60',
};

export const progressFill: Record<ReaderTheme, string> = {
  light: 'bg-gradient-to-r from-amber-600 to-amber-400',
  dark: 'bg-gradient-to-r from-amber-500 to-amber-300',
  sepia: 'bg-gradient-to-r from-amber-600 to-amber-400',
};

/** Page-level theme classes (slightly different from reader-internal classes). */
export const pageThemeClasses: Record<ReaderTheme, string> = {
  light: 'bg-[#fefdfb] text-gray-900',
  dark: 'bg-[#0c0a09] text-gray-100',
  sepia: 'bg-[#f5f0e4] text-amber-900',
};
