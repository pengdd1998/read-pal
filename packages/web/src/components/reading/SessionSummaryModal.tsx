'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface SessionSummaryModalProps {
 duration: number;
 chaptersRead: number;
 totalChapters: number;
 sessionId?: string | null;
 onKeepReading: () => void;
 onBackToLibrary: () => void;
}

export const SessionSummaryModal = React.memo(function SessionSummaryModal({
 duration,
 chaptersRead,
 totalChapters,
 sessionId,
 onKeepReading,
 onBackToLibrary,
}: SessionSummaryModalProps) {
 const t = useTranslations('reader');
 const [aiSummary, setAiSummary] = useState<string | null>(null);
 const [summaryLoading, setSummaryLoading] = useState(false);
 const [summaryError, setSummaryError] = useState(false);
 const mountedRef = useRef(true);
 useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

 const handleBackdropKey = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Escape') onKeepReading(); }, [onKeepReading]);
 const handlePanelClick = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

 useEffect(() => {
 if (!sessionId) return;
 let stale = false;
 setSummaryLoading(true);
 api.post<{ summary: string }>(`/api/reading-sessions/${sessionId}/summarize`)
  .then((res) => {
  if (stale) return;
  if (res.success && res.data?.summary) {
   setAiSummary(res.data.summary);
  }
  })
  .catch((err) => { warn("SessionSummaryModal: AI summary failed", err); setSummaryError(true); })
  .finally(() => { if (!stale) setSummaryLoading(false); });
  return () => { stale = true; };
 }, [sessionId]);

 return (
 <div
  role="dialog"
  aria-modal="true"
  aria-label={t('session_title')}
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in"
  onClick={onKeepReading}
        tabIndex={-1}
        onKeyDown={handleBackdropKey}
      >
  <div
  className="bg-surface-0 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scale-in"
  onClick={handlePanelClick}
  >
  <div className="text-center">
   <div className="text-4xl mb-3">{'\uD83D\uDCD6'}</div>
   <h3 className="text-lg font-bold text-gray-900 mb-1">{t('session_title')}</h3>
   <p className="text-sm text-gray-500 mb-4">{t('session_great_reading')}</p>

   <div className="grid grid-cols-2 gap-3 mb-4">
   <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
    {Math.floor(duration / 60)}m {duration % 60}s
    </div>
    <div className="text-xs text-gray-500 mt-1">{t('session_time_spent')}</div>
   </div>
   <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3">
    <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
    {chaptersRead}/{totalChapters}
    </div>
    <div className="text-xs text-gray-500 mt-1">{t('session_chapters_read')}</div>
   </div>
   </div>

   {/* AI Summary */}
   {summaryLoading && (
   <div className="mb-4 px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-left">
    <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
    <svg aria-hidden="true" className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    {t('session_generating_insight')}
    </div>
   </div>
   )}
   {aiSummary && !summaryLoading && (
   <div className="mb-4 px-3 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-left">
    <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1 flex items-center gap-1">
    <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
    {t('session_reading_insight')}
    </div>
    <p className="text-xs text-gray-700 leading-relaxed">{aiSummary}</p>
   </div>
   )}
   {summaryError && !summaryLoading && !aiSummary && (
   <div className="mb-4 px-3 py-2 rounded-xl bg-surface-1 text-left">
    <p className="text-xs text-gray-500 italic">{t('session_insight_unavailable')}</p>
    <button type="button" onClick={() => {
     setSummaryError(false);
     if (sessionId) {
      setSummaryLoading(true);
      api.post<{ summary: string }>(`/api/reading-sessions/${sessionId}/summarize`)
       .then((res) => { if (mountedRef.current && res.success && res.data?.summary) setAiSummary(res.data.summary); })
       .catch((err) => { warn('SessionSummaryModal: AI summary retry failed', err); if (mountedRef.current) setSummaryError(true); })
       .finally(() => { if (mountedRef.current) setSummaryLoading(false); });
     }
    }} className="mt-1 text-[10px] text-amber-600 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400">{t('session_retry_insight')}</button>
   </div>
   )}

   <div className="flex gap-3">
   <button type="button"
    onClick={onKeepReading}
    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-surface-1 text-gray-700 hover:bg-surface-2 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
    {t('session_keep_reading')}
   </button>
   <button type="button"
    onClick={onBackToLibrary}
    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
    {t('back_to_library')}
   </button>
   </div>
  </div>
  </div>
 </div>
 );
});
