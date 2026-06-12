'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';

interface InterventionToastProps {
 bookId: string;
 currentPage: number;
 totalPages: number;
 sessionDuration: number;
 highlightCount: number;
}

interface Intervention {
 type: string;
 message: string;
 priority: 'low' | 'medium' | 'high';
 action?: string;
}

const INTERVENTION_ICONS: Record<string, string> = {
 confusion_detected: '\uD83E\uDD14',
 chapter_end: '\uD83D\uDCD6',
 pace_coaching: '\u23F1\uFE0F',
 break_suggestion: '\u2615',
 celebration: '\uD83C\uDF89',
};

const INTERVENTION_COLORS: Record<string, string> = {
 low: 'border-surface-3',
 medium: 'border-amber-300 dark:border-amber-700',
 high: 'border-orange-300 dark:border-orange-700',
};

export const InterventionToast = React.memo(function InterventionToast({
 bookId,
 currentPage,
 totalPages,
 sessionDuration,
 highlightCount,
}: InterventionToastProps) {
 const t = useTranslations('common');
 const [intervention, setIntervention] = useState<Intervention | null>(null);
 const [visible, setVisible] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const dismissedRef = useRef<Set<string>>(new Set());
 const lastCheckRef = useRef(0);
 const pageChangeCountRef = useRef(0);
 const currentPageRef = useRef(currentPage);
 const totalPagesRef = useRef(totalPages);
 const highlightCountRef = useRef(highlightCount);
 const sessionDurationRef = useRef(sessionDuration);

 currentPageRef.current = currentPage;
 totalPagesRef.current = totalPages;
 highlightCountRef.current = highlightCount;
 sessionDurationRef.current = sessionDuration;

 // Track page changes for re-read detection
 useEffect(() => {
 pageChangeCountRef.current++;
 }, [currentPage]);

 // Check for interventions periodically
 useEffect(() => {
 const CHECK_INTERVAL = 60_000; // Check every 60s
 const MIN_SESSION_TIME = 30_000; // Don't check in first 30s
 let dismissTimer: ReturnType<typeof setTimeout> | undefined;
 let stale = false;

 const timer = setInterval(async () => {
  const now = Date.now();
  if (now - lastCheckRef.current < CHECK_INTERVAL) return;
  if (sessionDurationRef.current < MIN_SESSION_TIME / 1000) return;

  lastCheckRef.current = now;

  try {
  const res = await api.post<Intervention>('/api/interventions/check', {
   bookId,
   currentPage: currentPageRef.current,
   totalPages: totalPagesRef.current,
   highlightCount: highlightCountRef.current,
   sessionDuration: sessionDurationRef.current,
   reReadCount: 0,
  });

  if (stale) return;
  if (res.success && res.data) {
   const data = res.data;
   if (data && data.message && !dismissedRef.current.has(data.type)) {
   setIntervention(data);
   setVisible(true);
   // Auto-dismiss after 8 seconds for low priority
   if (data.priority === 'low') {
    if (dismissTimer) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => { if (!stale) setVisible(false); }, 8000);
   }
   }
  }
  } catch (err) {
  if (stale) return;
  warn('InterventionToast: intervention check failed', err);
  }
 }, CHECK_INTERVAL);

 return () => {
  stale = true;
  clearInterval(timer);
  if (dismissTimer) clearTimeout(dismissTimer);
 };
 }, [bookId]);

 const handleDismiss = useCallback(() => {
 if (submitting) return;
 setSubmitting(true);
 if (intervention) {
  dismissedRef.current = new Set(dismissedRef.current).add(intervention.type);
 }
 setVisible(false);
 // Record dismissal feedback
 if (intervention) {
  api.post('/api/interventions/feedback', {
  interventionType: intervention.type,
  dismissed: true,
  }).catch((err) => { warn('InterventionToast: failed to record dismissal feedback', err); }).finally(() => setSubmitting(false));
 } else {
  setSubmitting(false);
 }
 }, [intervention, submitting]);

 const handleHelpful = useCallback(() => {
 if (submitting) return;
 setSubmitting(true);
 if (intervention) {
  api.post('/api/interventions/feedback', {
  interventionType: intervention.type,
  helpful: true,
  }).catch((err) => { warn('InterventionToast: failed to record helpful feedback', err); }).finally(() => setSubmitting(false));
 }
 setVisible(false);
 }, [intervention, submitting]);

 if (!visible || !intervention) return null;

 return (
 <div role="status" aria-live="polite" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full px-4 animate-fade-in">
  <div className={`bg-surface-0 rounded-xl border-2 ${INTERVENTION_COLORS[intervention.priority] || INTERVENTION_COLORS.low} shadow-lg p-4`}>
  <div className="flex items-start gap-3">
   <span className="text-xl flex-shrink-0">{INTERVENTION_ICONS[intervention.type] || '\uD83D\uDCA1'}</span>
   <div className="flex-1 min-w-0">
   <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">{intervention.message}</p>
   <div className="flex items-center gap-2 mt-2">
    <button type="button"
    onClick={handleHelpful}
    disabled={submitting}
    className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
    >
    {submitting ? (
     <span className="flex items-center gap-1">
     <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
     </svg>
     {t('thanks')}
     </span>
    ) : t('thanks')}
    </button>
    <button type="button"
    onClick={handleDismiss}
    disabled={submitting}
    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
    >
    {t('dismiss')}
    </button>
   </div>
   </div>
   <button type="button"
   onClick={handleDismiss}
   className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 flex-shrink-0 p-2 -m-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
   aria-label={t('dismiss')}
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>
  </div>
 </div>
 );
});
