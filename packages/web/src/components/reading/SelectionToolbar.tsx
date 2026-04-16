'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { NotePopover } from './NotePopover';
import { QuoteCard } from './QuoteCard';
import { copyToClipboard } from '@/lib/clipboard';

const QUICK_TAGS = [
  { id: 'discuss', label: 'Discuss', emoji: '\u{1F4AC}' },
  { id: 'important', label: 'Key', emoji: '\u{2B50}' },
  { id: 'question', label: 'Question', emoji: '\u{2753}' },
  { id: 'key-idea', label: 'Idea', emoji: '\u{1F4A1}' },
];

interface SelectionToolbarProps {
  text: string;
  rect: DOMRect | null;
  range: Range | null;
  bookTitle?: string;
  author?: string;
  onHighlight: (text: string, color: string, tags?: string[]) => void;
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
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  if (!rect || rect.width === 0) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  // Desktop positioning
  const toolbarHeight = 44;
  const gap = 12;
  const showBelow = rect.top < window.innerHeight * 0.3;
  const top = showBelow ? rect.bottom + gap : rect.top - toolbarHeight - gap;
  const toolbarWidth = Math.min(420, window.innerWidth - 16);
  const left = Math.max(
    8,
    Math.min(
      rect.left + rect.width / 2 - toolbarWidth / 2,
      window.innerWidth - toolbarWidth - 8,
    ),
  );

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onDismiss();
      }, 1200);
    }
  }, [text, onDismiss]);

  const handleHighlight = useCallback(
    (color: string, tags?: string[]) => {
      onHighlight(text, color, tags);
      setHighlightToast(true);
      setPendingTag(null);
      setShowTagPicker(false);
      setTimeout(() => setHighlightToast(false), 1200);
    },
    [text, onHighlight],
  );

  const handleTagAndHighlight = useCallback(
    (color: string, tag: string) => {
      onHighlight(text, color, [tag]);
      setHighlightToast(true);
      setPendingTag(null);
      setShowTagPicker(false);
      setTimeout(() => setHighlightToast(false), 1200);
    },
    [text, onHighlight],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNote) setShowNote(false);
        else onDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showNote, onDismiss]);

  // ── MOBILE: bottom sheet ──
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-50 bg-black/20 animate-fade-in"
          onClick={onDismiss}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl animate-slide-up-mobile"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mt-3 mb-2" />

            {/* Text preview */}
            <div className="px-4 pb-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 italic leading-relaxed">
                &ldquo;{text.length > 120 ? text.slice(0, 120) + '...' : text}
                &rdquo;
              </p>
            </div>

            {/* Color dots */}
            <div className="flex items-center justify-center gap-3 px-4 py-3">
              {ANNOTATION_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => handleHighlight(color)}
                  className="w-9 h-9 rounded-full border-2 border-transparent hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 hover:scale-125 active:scale-90"
                  style={{ backgroundColor: color }}
                  aria-label={`Highlight in ${color}`}
                />
              ))}
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />

            {/* Actions */}
            <div className="flex items-center justify-around px-4 py-3">
              <button
                onClick={() => setShowNote(!showNote)}
                className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 active:scale-95 transition-transform"
                aria-label="Add note"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <span className="text-[10px] font-medium">Note</span>
              </button>

              <button
                onClick={() => setShowTagPicker(!showTagPicker)}
                className={`flex flex-col items-center gap-1 active:scale-95 transition-transform ${
                  showTagPicker ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'
                }`}
                aria-label="Tag and highlight"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  showTagPicker ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium">Tag</span>
              </button>

              <button
                onClick={handleCopy}
                className={`flex flex-col items-center gap-1 active:scale-95 transition-transform ${
                  copied ? 'text-emerald-500' : 'text-gray-600 dark:text-gray-400'
                }`}
                aria-label="Copy text"
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${copied ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                  {copied ? (
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <span className="text-[10px] font-medium">{copied ? 'Copied!' : 'Copy'}</span>
              </button>

              <button
                onClick={() => setShowQuoteCard(true)}
                className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 active:scale-95 transition-transform"
                aria-label="Share as quote card"
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium">Share</span>
              </button>

              {onAskAI && (
                <button
                  onClick={() => {
                    onAskAI(text);
                    onDismiss();
                  }}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                  aria-label="Ask AI about selected text"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Ask AI
                  </span>
                </button>
              )}
            </div>

            {/* Tag picker — mobile */}
            {showTagPicker && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">Quick tag + highlight</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map((qt) => (
                    <button
                      key={qt.id}
                      onClick={() => handleTagAndHighlight(ANNOTATION_COLORS[0], qt.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-all hover:border-amber-300 dark:hover:border-amber-700"
                    >
                      <span>{qt.emoji}</span>
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

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
        {showQuoteCard && (
          <QuoteCard
            text={text}
            bookTitle={bookTitle || ''}
            author={author || ''}
            onClose={() => setShowQuoteCard(false)}
          />
        )}
      </>
    );
  }

  // ── DESKTOP: floating toolbar ──
  return (
    <>
      <div
        ref={toolbarRef}
        data-selection-toolbar
        className="fixed z-50 animate-bounce-in"
        style={{ top, left }}
      >
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-lg max-w-[calc(100vw-16px)] overflow-x-auto">
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

          {/* Note */}
          <button
            onClick={() => setShowNote(!showNote)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Add note"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>Note</span>
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

          {/* Tag */}
          <button
            onClick={() => setShowTagPicker(!showTagPicker)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showTagPicker
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            aria-label="Tag and highlight"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span>Tag</span>
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Copy text"
          >
            {copied ? (
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
            <span className={copied ? 'text-emerald-500' : ''}>
              {copied ? 'Copied!' : 'Copy'}
            </span>
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

          {/* Share */}
          <button
            onClick={() => setShowQuoteCard(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Share as quote card"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>Share</span>
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-1.5" />

          {/* Ask AI */}
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

        {/* Tag picker popup — desktop */}
        {showTagPicker && (
          <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 min-w-[220px] z-10 animate-bounce-in">
            <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">Quick tag + highlight</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TAGS.map((qt) => (
                <button
                  key={qt.id}
                  onClick={() => handleTagAndHighlight(ANNOTATION_COLORS[0], qt.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:scale-95 transition-all"
                >
                  <span>{qt.emoji}</span>
                  {qt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Highlight toast */}
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
      </div>

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
      {showQuoteCard && (
        <QuoteCard
          text={text}
          bookTitle={bookTitle || ''}
          author={author || ''}
          onClose={() => setShowQuoteCard(false)}
        />
      )}
    </>
  );
}
