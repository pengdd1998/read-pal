'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
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

    const timer = setInterval(async () => {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL) return;
      if (sessionDuration < MIN_SESSION_TIME / 1000) return;

      lastCheckRef.current = now;

      try {
        const res = await api.post<{ type: string; message: string; priority: string; action?: string }>('/api/interventions/check', {
          bookId,
          currentPage,
          totalPages,
          highlightCount,
          sessionDuration,
          reReadCount: 0,
        });

        if (res.success && res.data) {
          const data = res.data as unknown as Intervention;
          if (data && data.message && !dismissed.has(data.type)) {
            setIntervention(data);
            setVisible(true);
            // Auto-dismiss after 8 seconds for low priority
            if (data.priority === 'low') {
              setTimeout(() => setVisible(false), 8000);
            }
          }
        }
      } catch {
        // Non-critical
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(timer);
  }, [bookId, currentPage, totalPages, sessionDuration, highlightCount, dismissed]);

  const handleDismiss = useCallback(() => {
    if (intervention) {
      setDismissed((prev) => new Set(prev).add(intervention.type));
    }
    setVisible(false);
    // Record dismissal feedback
    if (intervention) {
      api.post('/api/interventions/feedback', {
        interventionType: intervention.type,
        dismissed: true,
      }).catch(() => {});
    }
  }, [intervention]);

  const handleHelpful = useCallback(() => {
    if (intervention) {
      api.post('/api/interventions/feedback', {
        interventionType: intervention.type,
        helpful: true,
      }).catch(() => {});
    }
    setVisible(false);
  }, [intervention]);

  if (!visible || !intervention) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-sm w-full px-4 animate-fade-in">
      <div className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${INTERVENTION_COLORS[intervention.priority] || INTERVENTION_COLORS.low} shadow-lg p-4`}>
        <div className="flex items-start gap-3">
          <span className="text-xl flex-shrink-0">{INTERVENTION_ICONS[intervention.type] || '\uD83D\uDCA1'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-white leading-relaxed">{intervention.message}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleHelpful}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                Thanks
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex-shrink-0"
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
