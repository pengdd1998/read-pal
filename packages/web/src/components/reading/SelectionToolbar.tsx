'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { NotePopover } from './NotePopover';

interface SelectionToolbarProps {
  text: string;
  rect: DOMRect | null;
  range: Range | null;
  onHighlight: (text: string, color: string) => void;
  onNote: (text: string, note: string) => void;
  onDismiss: () => void;
}

export function SelectionToolbar({
  text,
  rect,
  range,
  onHighlight,
  onNote,
  onDismiss,
}: SelectionToolbarProps) {
  const [showNote, setShowNote] = useState(false);
  const [copied, setCopied] = useState(false);
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
      rect.left + rect.width / 2 - 190,
      window.innerWidth - 396,
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
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-lg">
        {/* Color dots */}
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onHighlight(text, color)}
            className="w-7 h-7 rounded-full border-2 border-transparent hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-150 hover:scale-110 active:scale-95"
            style={{ backgroundColor: color }}
            aria-label={`Highlight in ${color}`}
          />
        ))}

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />

        {/* Note button */}
        <button
          onClick={() => setShowNote(!showNote)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Add note"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span className="hidden sm:inline">Note</span>
        </button>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1" />

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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
      </div>

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
    </div>
  );
}
