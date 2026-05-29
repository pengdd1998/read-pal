'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface SelectionHintProps {
  onDismiss: () => void;
}

/**
 * Selection hint for new readers.
 * Auto-dismisses after 3s for returning users.
 */
export function SelectionHint({ onDismiss }: SelectionHintProps) {
  const t = useTranslations('reader');
  const [isReturningUser, setIsReturningUser] = useState(false);

  useEffect(() => {
    const returning = localStorage.getItem('read-pal-selection-used') === 'true';
    setIsReturningUser(returning);
    if (returning) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [onDismiss]);

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 animate-fade-in" style={{ animation: 'fade-in 0.5s 1.5s forwards' }}>
      <div className={`px-4 py-2 rounded-xl text-white text-sm backdrop-blur-sm shadow-lg flex items-center gap-2 pointer-events-auto ${
        isReturningUser ? 'bg-amber-600/60' : 'bg-amber-600/80'
      }`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span>{isReturningUser ? t('selection_hint_tip') : t('selection_hint_new')}</span>
        <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100 transition-opacity" aria-label={t('dismiss_label')}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
