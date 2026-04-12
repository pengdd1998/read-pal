import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
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
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
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
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Crimson Pro', 'Georgia', 'serif'],
        reading: ['Literata', 'Georgia', 'serif'],
        serif: ['Source Serif 4', 'Georgia', 'serif'],
        mono: ['Fira Code', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(30, 42, 56, 0.04)',
        'soft': '0 2px 8px -2px rgba(30, 42, 56, 0.08), 0 4px 16px -4px rgba(30, 42, 56, 0.04)',
        'md': '0 4px 12px -2px rgba(30, 42, 56, 0.1), 0 8px 24px -4px rgba(30, 42, 56, 0.06)',
        'lg': '0 8px 24px -4px rgba(30, 42, 56, 0.12), 0 16px 48px -8px rgba(30, 42, 56, 0.08)',
        'book': '0 2px 4px rgba(30, 42, 56, 0.06), 0 8px 16px rgba(30, 42, 56, 0.08), inset 0 -1px 0 rgba(30, 42, 56, 0.05)',
        'glow': '0 0 20px rgba(217, 119, 6, 0.2)',
        'glow-amber': '0 0 24px rgba(217, 119, 6, 0.25)',
      },
      transitionTimingFunction: {
        'out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up-delayed': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce-in': 'bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'float': 'float 6s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-up': 'slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        slideUp: {
          'from': { opacity: '0', transform: 'translateY(12px)' },
          'to': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          'from': { opacity: '0', transform: 'scale(0.95)' },
          'to': { opacity: '1', transform: 'scale(1)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
        slideInRight: {
          'from': { opacity: '0', transform: 'translateX(100%)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          'from': { opacity: '0', transform: 'translateX(-100%)' },
          'to': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: '65ch',
            lineHeight: '1.75',
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
  darkMode: 'class',
};

export default config;
