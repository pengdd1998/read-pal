'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { NotePopover } from './NotePopover';
import { QuoteCard } from './QuoteCard';
import { TagPicker } from './TagPicker';

interface DesktopSelectionToolbarProps {
 text: string;
 top: number;
 left: number;
 showNote: boolean;
 showQuoteCard: boolean;
 showTagPicker: boolean;
 copied: boolean;
 highlightToast: boolean;
 bookTitle?: string;
 author?: string;
 onToggleNote: () => void;
 onToggleTagPicker: () => void;
 onShowQuoteCard: () => void;
 onCopy: () => void;
 onHighlight: (color: string) => void;
 onTagAndHighlight: (color: string, tag: string) => void;
 onSaveNote: (note: string) => void;
 onCancelNote: () => void;
 onCloseQuoteCard: () => void;
 onAskAI?: (text: string) => void;
 onDismiss: () => void;
}

export const DesktopSelectionToolbar = memo(function DesktopSelectionToolbar({
 text,
 top,
 left,
 showNote,
 showQuoteCard,
 showTagPicker,
 copied,
 highlightToast,
 bookTitle,
 author,
 onToggleNote,
 onToggleTagPicker,
 onShowQuoteCard,
 onCopy,
 onHighlight,
 onTagAndHighlight,
 onSaveNote,
 onCancelNote,
 onCloseQuoteCard,
 onAskAI,
 onDismiss,
}: DesktopSelectionToolbarProps) {
 const t = useTranslations('reader');

 return (
 <div
  data-selection-toolbar
  className="fixed z-40 animate-bounce-in"
  style={{ top, left }}
 >
  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-3 bg-surface-0/95 backdrop-blur-sm shadow-lg max-w-[calc(100vw-16px)] overflow-x-auto">
  {/* Color dots */}
  {ANNOTATION_COLORS.map((color) => (
   <button
   key={color}
   onMouseDown={(e) => e.preventDefault()}
   onClick={() => onHighlight(color)}
   className="min-w-[44px] min-h-[44px] rounded-full border-2 border-transparent hover:border-gray-400 transition-all duration-200 hover:scale-110 active:scale-90 flex items-center justify-center"
   aria-label={t('toolbar_highlight_in', { color })}
   >
   <span className="w-7 h-7 rounded-full" style={{ backgroundColor: color }} />
   </button>
  ))}

  <div className="w-px h-6 bg-surface-2 mx-1.5" />

  {/* Note */}
  <button
   onMouseDown={(e) => { e.preventDefault(); onToggleNote(); }}
   className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-surface-1 transition-colors"
   aria-label={t('toolbar_add_note')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
   </svg>
   <span>{t('toolbar_note')}</span>
  </button>

  <div className="w-px h-6 bg-surface-2 mx-1.5" />

  {/* Tag */}
  <button
   onMouseDown={(e) => { e.preventDefault(); onToggleTagPicker(); }}
   className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
   showTagPicker
    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    : 'text-gray-700 dark:text-gray-300 hover:bg-surface-1'
   }`}
   aria-label={t('toolbar_tag_and_highlight')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
   </svg>
   <span>{t('toolbar_tag')}</span>
  </button>

  <div className="w-px h-6 bg-surface-2 mx-1.5" />

  {/* Copy */}
  <button
   onMouseDown={(e) => e.preventDefault()}
   onClick={onCopy}
   className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-surface-1 transition-colors"
   aria-label={t('toolbar_copy_text')}
  >
   {copied ? (
   <svg aria-hidden="true" className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
   </svg>
   ) : (
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
   </svg>
   )}
   <span className={copied ? 'text-emerald-500' : ''}>
   {copied ? t('toolbar_copied') : t('toolbar_copy')}
   </span>
  </button>

  <div className="w-px h-6 bg-surface-2 mx-1.5" />

  {/* Share */}
  <button
   onMouseDown={(e) => { e.preventDefault(); onShowQuoteCard(); }}
   className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-surface-1 transition-colors"
   aria-label={t('toolbar_share_as_quote')}
  >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
   </svg>
   <span>{t('toolbar_share')}</span>
  </button>

  <div className="w-px h-6 bg-surface-2 mx-1.5" />

  {/* Ask AI */}
  {onAskAI && (
   <button
   onClick={() => {
    onAskAI(text);
    onDismiss();
   }}
   className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-amber-500 to-teal-500 text-white hover:from-amber-600 hover:to-teal-600 transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   aria-label={t('toolbar_ask_ai_about')}
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
   </svg>
   <span>{t('toolbar_ask_ai')}</span>
   </button>
  )}
  </div>

  {showTagPicker && (
  <TagPicker variant="desktop" onTagSelect={onTagAndHighlight} />
  )}

  {/* Highlight toast */}
  {highlightToast && (
  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 animate-bounce-in">
   <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium shadow-lg">
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
   </svg>
   {t('toolbar_highlighted')}
   </div>
  </div>
  )}

  {showNote && (
  <NotePopover
   selectedText={text}
   onSave={(note) => {
   onSaveNote(note);
   }}
   onCancel={onCancelNote}
  />
  )}
  {showQuoteCard && (
  <QuoteCard
   text={text}
   bookTitle={bookTitle || ''}
   author={author || ''}
   onClose={onCloseQuoteCard}
  />
  )}
 </div>
 );
});