'use client';

import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';

interface ReaderViewProps {
  bookId: string;
  content: string;
  title: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const STORAGE_KEY_PREFIX = 'reader-settings';

function loadSettings(bookId: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}-${bookId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(bookId: string, settings: { fontSize: number; theme: string }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}-${bookId}`, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable
  }
}

export function ReaderView({
  bookId,
  content,
  title,
  currentPage,
  totalPages,
  onPageChange,
}: ReaderViewProps) {
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [showControls, setShowControls] = useState(false);

  // Load persisted settings on mount / book change
  useEffect(() => {
    const saved = loadSettings(bookId);
    if (saved) {
      if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'sepia') {
        setTheme(saved.theme);
      }
    }
  }, [bookId]);

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(bookId, { fontSize, theme });
  }, [bookId, fontSize, theme]);

  const handlePrevious = useCallback(() => {
    if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      onPageChange(currentPage + 1);
    }
  }, [currentPage, totalPages, onPageChange]);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handlePrevious, handleNext]);

  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    sepia: 'bg-amber-50 text-amber-900',
  };

  return (
    <div
      className={`flex flex-col h-screen ${themeClasses[theme]} transition-colors duration-200`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Header */}
      <header
        className={`flex flex-col md:flex-row md:items-center md:justify-between px-4 md:px-6 py-3 md:py-4 border-b transition-opacity duration-200 gap-2 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="min-w-0">
          <h1 className="text-base md:text-xl font-semibold truncate">{title}</h1>
          <p className="text-sm opacity-70">
            Page {currentPage + 1} of {totalPages}
          </p>
        </div>

        {/* Reading Controls */}
        <div className="flex items-center gap-3 md:gap-4 flex-shrink-0">
          {/* Font Size */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-sm">{fontSize}px</span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              className="px-3 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Theme */}
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`px-3 py-1 rounded ${
                theme === 'light'
                  ? 'bg-gray-300 dark:bg-gray-600'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Light theme"
            >
              {'☀\uFE0F'}
            </button>
            <button
              onClick={() => setTheme('sepia')}
              className={`px-3 py-1 rounded ${
                theme === 'sepia'
                  ? 'bg-amber-200'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Sepia theme"
            >
              {'📖'}
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`px-3 py-1 rounded ${
                theme === 'dark'
                  ? 'bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              aria-label="Dark theme"
            >
              {'🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <article
          className="reading-mode"
          style={{ fontSize: `${fontSize}px` }}
        >
          <div
            className="prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
          />
        </article>
      </div>

      {/* Footer Navigation */}
      <footer
        className={`flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-t transition-opacity duration-200 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={handlePrevious}
          disabled={currentPage === 0}
          className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
        >
          {'\u2190'} Prev
        </button>

        {/* Progress Bar */}
        <div className="flex-1 mx-2 md:mx-8">
          <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
            />
          </div>
          <p className="text-center text-xs md:text-sm mt-1 opacity-70">
            {Math.round(((currentPage + 1) / totalPages) * 100)}%
          </p>
        </div>

        <button
          onClick={handleNext}
          disabled={currentPage >= totalPages - 1}
          className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
        >
          Next {'\u2192'}
        </button>
      </footer>
    </div>
  );
}
