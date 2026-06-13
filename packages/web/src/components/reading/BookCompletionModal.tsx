'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface BookCompletionModalProps {
 bookId: string;
 bookTitle: string;
 totalHighlights: number;
 totalNotes: number;
 totalChapters: number;
 onClose: () => void;
}

export const BookCompletionModal = React.memo(function BookCompletionModal({
 bookId,
 bookTitle,
 totalHighlights,
 totalNotes,
 totalChapters,
 onClose,
}: BookCompletionModalProps) {
 const t = useTranslations('reader');
 const router = useRouter();
 const [generating, setGenerating] = useState(false);
 const [genError, setGenError] = useState<string | null>(null);
 const mountedRef = useRef(true);
 const dialogRef = useRef<HTMLDivElement>(null);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
 useEffect(() => { dialogRef.current?.focus(); }, []);

 const handleGeneratePersonalBook = async () => {
 setGenerating(true);
 setGenError(null);
 try {
  const res = await api.post(`/api/memory-books/${bookId}/generate`, {
  format: 'personal_book',
  }, { timeout: 120_000 });
  if (!mountedRef.current) return;
  if (res.success) {
  router.push(`/memory-books/${bookId}`);
  } else {
  warn('BookCompletionModal: generate returned success=false', res.error);
  setGenError(t('completion_failed_generate'));
  }
 } catch (error) {
  if (!mountedRef.current) return;
  warn('BookCompletionModal: generate failed', error);
  setGenError(t('completion_failed_generate'));
 } finally {
  if (mountedRef.current) setGenerating(false);
 }
 };

 return (
 <div
  ref={dialogRef}
  role="dialog"
  aria-modal="true"
  aria-label={t('completion_title')}
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
  onClick={onClose}
  tabIndex={-1}
  onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
 >
  <div
  className="bg-surface-0 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 animate-scale-in text-center"
  onClick={(e) => e.stopPropagation()}
  >
  <div className="text-6xl mb-4">{'\uD83C\uDF89'}</div>
  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('completion_title')}</h3>
  <p className="text-gray-500 dark:text-gray-400 mb-5">{t('completion_subtitle')} <strong>{bookTitle}</strong></p>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
   <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
   <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalHighlights}</div>
   <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t('completion_highlights')}</div>
   </div>
   <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3">
   <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{totalNotes}</div>
   <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t('completion_notes')}</div>
   </div>
   <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
   <div className="text-xl font-bold text-violet-600 dark:text-violet-400">{totalChapters}</div>
   <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{t('completion_chapters')}</div>
   </div>
  </div>

  {(totalHighlights > 0 || totalNotes > 0) && (
   <>
   <button type="button"
    onClick={handleGeneratePersonalBook}
    disabled={generating}
    className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 transition-all shadow-md disabled:opacity-60 mb-3 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
    {generating ? (
    <span className="flex items-center justify-center gap-2">
     <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
     </svg>
     {t('completion_creating_book')}
    </span>
    ) : (
    t('completion_create_book')
    )}
   </button>
   {genError && (
    <p role="alert" className="text-xs text-red-500 dark:text-red-400 mb-3">{genError}</p>
   )}
   </>
  )}

  <button type="button"
   onClick={onClose}
   className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   {t('completion_keep_exploring')}
  </button>
  </div>
 </div>
 );
});
