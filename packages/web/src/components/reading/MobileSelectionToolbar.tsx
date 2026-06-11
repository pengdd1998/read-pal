'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { NotePopover } from './NotePopover';
import { QuoteCard } from './QuoteCard';
import { TagPicker } from './TagPicker';
import { hapticMedium } from '@/lib/haptics';

interface MobileSelectionToolbarProps {
 text: string;
 showNote: boolean;
 showQuoteCard: boolean;
 showTagPicker: boolean;
 copied: boolean;
 bookTitle?: string;
 author?: string;
 onDismiss: () => void;
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
}

export const MobileSelectionToolbar = memo(function MobileSelectionToolbar({
 text,
 showNote,
 showQuoteCard,
 showTagPicker,
 copied,
 bookTitle,
 author,
 onDismiss,
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
}: MobileSelectionToolbarProps) {
 const t = useTranslations('reader');

 return (
 <div
  data-selection-toolbar
  className="fixed inset-0 z-40 bg-black/20 animate-fade-in"
  onClick={() => { if (!showNote && !showQuoteCard) onDismiss(); }}
  onKeyDown={(e) => { if (e.key === 'Escape' && !showNote && !showQuoteCard) onDismiss(); }}
 >
  <div
  className="absolute bottom-0 left-0 right-0 bg-surface-0 rounded-t-2xl shadow-2xl animate-slide-up-mobile max-h-[70vh] overflow-y-auto safe-area-bottom"
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
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => onHighlight(color)}
    className="min-w-[44px] min-h-[44px] rounded-full border-2 border-transparent hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 hover:scale-110 active:scale-90 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
    aria-label={t('toolbar_highlight_in', { color })}
   >
    <span className="w-9 h-9 rounded-full" style={{ backgroundColor: color }} />
   </button>
   ))}
  </div>

  <div className="h-px bg-surface-1 mx-4" />

  {/* Actions */}
  <div className="flex items-center justify-around px-4 py-3">
   <button
   onMouseDown={(e) => { e.preventDefault(); onToggleNote(); }}
   className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   aria-label={t('toolbar_add_note')}
   >
   <div className="w-11 h-11 rounded-xl bg-surface-1 flex items-center justify-center">
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
   </div>
   <span className="text-[10px] font-medium">{t('toolbar_note')}</span>
   </button>

   <button
   onMouseDown={(e) => { e.preventDefault(); onToggleTagPicker(); }}
   className={`flex flex-col items-center gap-1 active:scale-95 transition-transform ${
    showTagPicker ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1'
   }`}
   aria-label={t('toolbar_tag_and_highlight')}
   >
   <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
    showTagPicker ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-surface-1'
   }`}>
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
   </div>
   <span className="text-[10px] font-medium">{t('toolbar_tag')}</span>
   </button>

   <button
   onMouseDown={(e) => e.preventDefault()}
   onClick={onCopy}
   className={`flex flex-col items-center gap-1 active:scale-95 transition-transform ${
    copied ? 'text-emerald-500' : 'text-gray-600 dark:text-gray-400 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1'
   }`}
   aria-label={t('toolbar_copy_text')}
   >
   <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${copied ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-surface-1'}`}>
    {copied ? (
    <svg aria-hidden="true" className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    ) : (
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
    )}
   </div>
   <span className="text-[10px] font-medium">{copied ? t('toolbar_copied') : t('toolbar_copy')}</span>
   </button>

   <button
   onMouseDown={(e) => { e.preventDefault(); onShowQuoteCard(); }}
   className="flex flex-col items-center gap-1 text-gray-600 dark:text-gray-400 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   aria-label={t('toolbar_share_as_quote')}
   >
   <div className="w-11 h-11 rounded-xl bg-surface-1 flex items-center justify-center">
    <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
   </div>
   <span className="text-[10px] font-medium">{t('toolbar_share')}</span>
   </button>

   {onAskAI && (
   <button
    onClick={() => onAskAI(text)}
    className="flex flex-col items-center gap-1 active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    aria-label={t('toolbar_ask_ai_about')}
   >
    <div className="w-11 h-11 rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 flex items-center justify-center shadow-sm">
    <svg aria-hidden="true" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
    </div>
    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
    {t('toolbar_ask_ai')}
    </span>
   </button>
   )}
  </div>

  {showTagPicker && (
   <TagPicker variant="mobile" onTagSelect={onTagAndHighlight} />
  )}

  {showNote && (
   <div className="px-4 pb-4">
   <NotePopover
    selectedText={text}
    onSave={(note) => {
    hapticMedium();
    onSaveNote(note);
    }}
    onCancel={onCancelNote}
   />
   </div>
  )}
  {showQuoteCard && (
   <div className="px-4 pb-4">
   <QuoteCard
    text={text}
    bookTitle={bookTitle || ''}
    author={author || ''}
    onClose={onCloseQuoteCard}
   />
   </div>
  )}
  </div>
 </div>
 );
});