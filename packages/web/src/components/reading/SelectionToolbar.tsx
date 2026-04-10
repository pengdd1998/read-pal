'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { NotePopover } from './NotePopover';
import { QuoteCard } from './QuoteCard';

interface SelectionToolbarProps {
  text: string;
  rect: DOMRect | null;
  range: Range | null;
  bookTitle?: string;
  author?: string;
  onHighlight: (text: string, color: string) => void;
  onNote: (text: string, note: string) => void;
  onDismiss: () => void;
  onAskAI?: (text: string) => void;
}

export function SelectionToolbar({
  text,
  rect,
  range,
  bookTitle,
  author,
  onHighlight,
  onNote,
  onDismiss,
  onAskAI,
}: SelectionToolbarProps) {
  const [showNote, setShowNote] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightToast, setHighlightToast] = useState(false);
  const [showQuoteCard, setShowQuoteCard] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Compute position — rect is from getBoundingClientRect (viewport-relative),
  // toolbar uses position:fixed so no scroll offset needed
  if (!rect || rect.width === 0) return null;

  const toolbarHeight = 44;
  const gap = 12;
  const showBelow = rect.top < window.innerHeight * 0.3;
  const top = showBelow
    ? rect.bottom + gap
    : rect.top - toolbarHeight - gap;
  const left = Math.max(
    16,
    Math.min(
      rect.left + rect.width / 2 - 210,
      window.innerWidth - 440,
    ),
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onDismiss();
      }, 1200);
    } catch {
      // Fallback or ignore
    }
  }, [text, onDismiss]);

  const handleHighlight = useCallback((color: string) => {
    onHighlight(text, color);
    setHighlightToast(true);
    setTimeout(() => {
      setHighlightToast(false);
    }, 1200);
  }, [text, onHighlight]);

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNote) {
          setShowNote(false);
        } else {
          onDismiss();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showNote, onDismiss]);

  return (
    <div
      ref={toolbarRef}
      data-selection-toolbar
      className="fixed z-50 animate-bounce-in"
      style={{ top, left }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-lg">
        {/* Color dots */}
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => handleHighlight(color)}
            className="w-7 h-7 rounded-full border-2 border-transparent hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 hover:scale-125 active:scale-90"
            style={{ backgroundColor: color }}
            aria-label={`Highlight in ${color}`}
          />
        ))}

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

        {/* Note button */}
        <button
          onClick={() => setShowNote(!showNote)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Add note"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="hidden sm:inline">Note</span>
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Copy text"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-500">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">Copy</span>
            </>
          )}
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

        {/* Share as Quote Card button */}
        <button
          onClick={() => setShowQuoteCard(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Share as quote card"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="hidden sm:inline">Share</span>
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

        {/* Ask AI button */}
        {onAskAI && (
          <button
            onClick={() => {
              onAskAI(text);
              onDismiss();
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-amber-500 to-teal-500 text-white hover:from-amber-600 hover:to-teal-600 transition-colors active:scale-95"
            aria-label="Ask AI about selected text"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span>Ask AI</span>
          </button>
        )}
      </div>

      {/* Highlight confirmation toast */}
      {highlightToast && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 animate-bounce-in">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium shadow-lg">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Highlighted!
          </div>
        </div>
      )}

      {/* Note popover */}
      {showNote && (
        <NotePopover
          selectedText={text}
          onSave={(note) => {
            onNote(text, note);
            setShowNote(false);
          }}
          onCancel={() => setShowNote(false)}
        />
      )}

      {/* Quote Card overlay */}
      {showQuoteCard && (
        <QuoteCard
          text={text}
          bookTitle={bookTitle || ''}
          author={author || ''}
          onClose={() => setShowQuoteCard(false)}
        />
      )}
    </div>
  );
}
