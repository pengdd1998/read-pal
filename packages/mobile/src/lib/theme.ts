/**
 * ReadPal Design System
 *
 * Single source of truth for colors, typography, spacing, and motion.
 * Aligns with NativeWind/Tailwind tokens defined in tailwind.config.ts.
 */

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------

export const colors = {
  // Primary (warm amber)
  primary: {
    50: '#fefdfb',
    100: '#f9f5f0',
    200: '#f0e9e0',
    300: '#d4b896',
    400: '#b8916a',
    500: '#d97706',   // CTA / Accent
    600: '#b45309',
    700: '#92400e',
    800: '#78350f',
  },

  // Navy (text + dark surfaces)
  navy: {
    50: '#f0f2f5',
    100: '#d8dde5',
    200: '#b1bbc9',
    300: '#6b7f96',
    400: '#4f6579',
    500: '#3d5578',
    600: '#2d4060',
    700: '#1e2a38',
    800: '#151d28',
    900: '#0d1219',
  },

  // Surfaces
  surface: {
    0: '#fdfbf7',
    1: '#f9f5f0',
    2: '#f0e9e0',
    3: '#e8dfd4',
  },

  // Semantic
  sage: '#6b9e76',
  russet: '#a65d57',
  forest: '#2d5a4a',

  // AI-specific
  ai: {
    bubble: '#fef8ee',
    glow: 'rgba(217, 119, 6, 0.15)',
    accent: '#f59e0b',
  },

  // Reading themes
  reading: {
    light: '#fefdfb',
    dark: '#1a1a2e',
    sepia: '#f4ecd8',
    darkText: '#e8e0d4',
    sepiaText: '#3d3020',
  },

  // Persona colors
  persona: {
    sage:  { primary: '#d97706', bg: 'rgba(217,119,6,0.08)', text: '#92400e' },
    penny: { primary: '#e85d75', bg: 'rgba(232,93,117,0.08)', text: '#9b2c3e' },
    alex:  { primary: '#2b8a94', bg: 'rgba(43,138,148,0.08)', text: '#1a5f66' },
    quinn: { primary: '#7c5cbf', bg: 'rgba(124,92,191,0.08)', text: '#4a3580' },
    sam:   { primary: '#4caf50', bg: 'rgba(76,175,80,0.08)', text: '#2e7d32' },
  },

  // Gamification
  gamification: {
    streak: '#f59e0b',
    completion: '#6b9e76',
    challenge: '#3d5578',
    mastery: '#d97706',
    again: '#ef4444',
    hard: '#f97316',
    good: '#6b9e76',
    easy: '#2b8a94',
  },

  // Dark mode overrides
  dark: {
    surface: '#252538',
    surfaceElevated: '#2d2d44',
    text: '#e8e0d4',
    textSecondary: '#8a8090',
    border: '#3a3a50',
  },

  // Highlight colors
  highlight: {
    amber: 'rgba(217, 119, 6, 0.25)',
    sage: 'rgba(107, 158, 118, 0.25)',
    russet: 'rgba(166, 93, 87, 0.25)',
    forest: 'rgba(45, 90, 74, 0.25)',
    navy: 'rgba(61, 85, 120, 0.25)',
  },
} as const;

// ---------------------------------------------------------------------------
// Typography Scale
// ---------------------------------------------------------------------------

export const typography = {
  display: {
    fontSize: 28,
    fontWeight: '700' as const,
    fontFamily: 'Crimson Pro',
    lineHeight: 34,
  },
  title: {
    fontSize: 20,
    fontWeight: '600' as const,
    fontFamily: 'DM Sans',
    lineHeight: 26,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    fontFamily: 'DM Sans',
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'DM Sans',
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    fontFamily: 'DM Sans',
    lineHeight: 18,
  },
  captionMedium: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'DM Sans',
    lineHeight: 18,
  },
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
    fontFamily: 'DM Sans',
    lineHeight: 22,
  },
  overline: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'DM Sans',
    lineHeight: 16,
    letterSpacing: 0.8,
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing (4px base)
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const shadows = {
  sm: {
    shadowColor: '#1e2a38',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: '#1e2a38',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#1e2a38',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Animation Durations
// ---------------------------------------------------------------------------

export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
