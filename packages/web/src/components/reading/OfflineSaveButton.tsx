'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { isCapacitor } from '@/lib/capacitor';
import { cacheBook, isCached, removeCachedBook } from '@/lib/mobile-cache';
import { hapticSuccess, hapticMedium } from '@/lib/haptics';

interface OfflineSaveButtonProps {
 bookId: string;
}

type SaveState = 'idle' | 'cached' | 'saving' | 'error';

export const OfflineSaveButton = React.memo(function OfflineSaveButton({ bookId }: OfflineSaveButtonProps) {
 const t = useTranslations('reader');
 const [state, setState] = useState<SaveState>('idle');
 const [progress, setProgress] = useState(0);
 const mountedRef = useRef(true);
 const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
 const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 useEffect(() => () => {
  mountedRef.current = false;
  if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
 }, []);

 // Check if already cached on mount
 useEffect(() => {
 if (!isCapacitor()) return;
 let cancelled = false;
 isCached(bookId).then((cached) => {
  if (!cancelled && cached) setState('cached');
 }).catch((err) => { console.warn("OfflineSaveButton: cache check failed", err); });
 return () => { cancelled = true; };
 }, [bookId]);

 const handleSave = useCallback(async () => {
 if (!isCapacitor() || state === 'saving') return;

 if (state === 'cached') {
  // Toggle: remove from cache
  setState('saving');
  setProgress(0);
  await removeCachedBook(bookId);
  setState('idle');
  setProgress(0);
  return;
 }

 setState('saving');
 setProgress(10);

 // Simulate progress since we don't have granular chapter progress
 progressIntervalRef.current = setInterval(() => {
  if (mountedRef.current) setProgress((prev) => Math.min(prev + 15, 85));
 }, 300);

 try {
  const result = await cacheBook(bookId);
  if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }

  if (result.cached > 0) {
  setProgress(100);
  await hapticSuccess();
  // Brief delay to show 100% before switching to checkmark
  await new Promise((r) => setTimeout(r, 400));
  setState('cached');
  } else {
  setState('error');
  await hapticMedium();
  // Reset after 2s
  resetTimerRef.current = setTimeout(() => { if (mountedRef.current) setState('idle'); }, 2000);
  }
 } catch (error) {
  console.warn('OfflineSaveButton: cache save failed', error);
  if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
  setState('error');
  resetTimerRef.current = setTimeout(() => { if (mountedRef.current) setState('idle'); }, 2000);
 }
 setProgress(0);
 }, [bookId, state]);

 // Only render inside Capacitor
 if (!isCapacitor()) return null;

 const buttonClass =
 state === 'cached'
  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
  : state === 'saving'
  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
  : state === 'error'
   ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
   : 'text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20';

 return (
 <button
  onClick={handleSave}
  disabled={state === 'saving'}
  className={`w-11 h-11 flex items-center justify-center rounded-lg text-sm transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 relative ${buttonClass}`}
  aria-label={
  state === 'cached'
   ? t('offline_remove_aria')
   : state === 'saving'
   ? t('offline_saving_aria', { progress })
   : t('offline_save_aria')
  }
  title={
  state === 'cached'
   ? t('offline_available_title')
   : t('offline_save_title')
  }
 >
  {state === 'cached' ? (
  // Checkmark
  <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
  ) : state === 'saving' ? (
  // Progress spinner
  <svg aria-hidden="true" className="w-[18px] h-[18px] animate-spin" fill="none" viewBox="0 0 24 24">
   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
  ) : state === 'error' ? (
  // Error icon
  <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
  ) : (
  // Download icon
  <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
  )}

  {/* Mini progress bar at bottom of button */}
  {state === 'saving' && progress > 0 && (
  <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-surface-2 rounded-full overflow-hidden">
   <div
   className="h-full bg-amber-500 rounded-full transition-all duration-300"
   style={{ width: `${progress}%` }}
   />
  </div>
  )}
 </button>
 );
});
