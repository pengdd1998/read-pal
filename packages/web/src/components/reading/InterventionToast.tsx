'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

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
  low: 'border-gray-200 dark:border-gray-700',
  medium: 'border-amber-300 dark:border-amber-700',
  high: 'border-orange-300 dark:border-orange-700',
};

export function InterventionToast({
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

  // Track page changes for re-read detection
  useEffect(() => {
    pageChangeCountRef.current++;
  }, [currentPage]);

  // Check for interventions periodically
  useEffect(() => {
    const CHECK_INTERVAL = 60_000; // Check every 60s
    const MIN_SESSION_TIME = 30_000; // Don't check in first 30s
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setInterval(async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      if (sessionDuration < MIN_SESSION_TIME / 1000) return;

      lastCheckRef.current = now;

      try {
        const res = await api.post<Intervention>('/api/interventions/check', {
          bookId,
          currentPage,
          totalPages,
          highlightCount,
          sessionDuration,
          reReadCount: 0,
        });

        if (res.success && res.data) {
          const data = res.data;
          if (data && data.message && !dismissedRef.current.has(data.type)) {
            setIntervention(data);
            setVisible(true);
            // Auto-dismiss after 8 seconds for low priority
            if (data.priority === 'low') {
              if (dismissTimer) clearTimeout(dismissTimer);
              dismissTimer = setTimeout(() => setVisible(false), 8000);
            }
          }
        }
      } catch (err) {
        console.warn('Intervention check failed:', err);
      }
    }, CHECK_INTERVAL);

    return () => {
      clearInterval(timer);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [bookId, currentPage, totalPages, sessionDuration, highlightCount]);

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
      }).catch(() => {}).finally(() => setSubmitting(false));
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
      }).catch(() => {}).finally(() => setSubmitting(false));
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
            <p className="text-sm text-gray-900 dark:text-white leading-relaxed">{intervention.message}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleHelpful}
                disabled={submitting}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('thanks')}
                  </span>
                ) : t('thanks')}
              </button>
              <button
                onClick={handleDismiss}
                disabled={submitting}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
              >
                {t('dismiss')}
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0 p-2 -m-2"
            aria-label={t('dismiss')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
