// Design tokens — single source for the palette (M4a).
// The web tailwind config consumes these; the mobile fork
// (src/theme/tokens.ts) is frozen under D1 and joins when 4d unfreezes.

export const palette = {
  primary: {
    50: '#fefdfb',
    100: '#f9f5f0',
    200: '#f0e9e0',
    300: '#d4b896',
    400: '#b8916a',
    500: '#d97706',
    600: '#b45309',
    700: '#92400e',
    800: '#78350f',
    900: '#451a03',
    950: '#2a1002',
  },
  accent: {
    50: '#faf5f0',
    100: '#f0e6d6',
    200: '#d4b896',
    300: '#c8956c',
    400: '#a65d57',
    500: '#d97706',
    600: '#2d5a4a',
  },
  reading: {
    light: '#fefdfb',
    dark: '#0f1419',
    sepia: '#f8f4ec',
  },
  navy: {
    50: '#f0f2f5',
    100: '#d8dde5',
    200: '#b1bbc9',
    300: '#8a99ae',
    400: '#637793',
    500: '#3d5578',
    600: '#2d4060',
    700: '#1e2a38',
    800: '#151d28',
    900: '#0d1219',
  },
  sage: '#7a9e7e',
  russet: '#a65d57',
  forest: '#2d5a4a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;
