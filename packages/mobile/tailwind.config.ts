import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  presets: [
    require('nativewind/preset'),
  ],
  theme: {
    extend: {
      colors: {
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
        surface: {
          0: '#ffffff',
          1: '#f9f5f0',
          2: '#f0e9e0',
          3: '#e8dfd4',
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
      },
      fontFamily: {
        sans: ['DM Sans'],
        display: ['Crimson Pro'],
        reading: ['Literata'],
        serif: ['Source Serif 4'],
        mono: ['Fira Code'],
      },
    },
  },
  plugins: [],
};

export default config;
