'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import type { Book } from '@read-pal/shared';
import { warn } from '@/lib/logger';

interface LibraryEmptyStateProps {
 onBookAdded: (book: Book) => void;
 uploaderRef: React.RefObject<HTMLDivElement | null>;
}

export const LibraryEmptyState = React.memo(function LibraryEmptyState({ onBookAdded, uploaderRef }: LibraryEmptyStateProps) {
 const t = useTranslations('library');
 const [seeding, setSeeding] = useState(false);
 const [error, setError] = useState('');
 const mountedRef = useRef(true);

 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const handleSeedSample = async () => {
 setError('');
 try {
  setSeeding(true);
  const res = await api.post<{ book: Book }>('/api/books/seed-sample');
  if (!mountedRef.current) return;
  if (res.success && res.data?.book) {
  onBookAdded(res.data.book);
  } else {
  setError(t('failed_seed_sample'));
  }
 } catch (error) {
  warn('LibraryEmptyState: seed failed', error);
  if (!mountedRef.current) return;
  setError(t('failed_seed_sample'));
 } finally {
  if (mountedRef.current) setSeeding(false);
 }
 };

 return (
 <div className="animate-scale-in">
  <div className="text-center py-12">
  <div className="w-24 h-24 mx-auto mb-5 relative">
   <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-amber-100 dark:from-primary-900/30 dark:to-amber-900/30 rounded-3xl rotate-6 scale-95" />
   <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-amber-50 dark:from-primary-900/20 dark:to-amber-900/20 rounded-3xl flex items-center justify-center shadow-sm">
   <svg aria-hidden="true" className="w-10 h-10 text-primary-400 dark:text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <line x1="9" y1="7" x2="16" y2="7" />
    <line x1="9" y1="11" x2="14" y2="11" />
   </svg>
   </div>
  </div>
  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-xl mb-2">
   {t('start_reading_journey')}
  </h3>
  <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6 leading-relaxed">
   {t('empty_state_desc')}
  </p>

  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
   <button type="button"
   onClick={handleSeedSample}
   disabled={seeding}
   aria-label={seeding ? t('loading_sample') : t('try_gatsby')}
   className="btn btn-primary hover:scale-105 active:scale-95 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
   </svg>
   {seeding ? t('loading_sample') : t('try_gatsby')}
   </button>
   <button type="button"
   onClick={() => uploaderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
   aria-label={t('upload_own_book')}
   className="btn bg-surface-0 border border-surface-3 text-gray-700 hover:border-amber-300 dark:hover:border-amber-600 hover:text-amber-700 dark:hover:text-amber-300 transition-all flex items-center gap-2"
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
   </svg>
   {t('upload_own_book')}
   </button>
  </div>

  <p className="text-xs text-gray-500 flex items-center justify-center gap-1.5">
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
   </svg>
   {t('drag_drop_hint')}
  </p>
  </div>
  {error && (
  <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs text-center">
   <p>{error}</p>
   <button type="button"
    onClick={handleSeedSample}
    disabled={seeding}
    className="mt-2 min-h-[44px] px-4 py-2 text-xs font-medium bg-red-100 dark:bg-red-900 rounded-lg hover:bg-red-200 dark:hover:bg-red-800 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400"
   >
    {seeding ? t('loading_sample') : t('try_gatsby')}
   </button>
  </div>
  )}
 </div>
 );
});
