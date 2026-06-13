'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { safeGetItem } from '@/lib/safe-storage';

interface SelectionHintProps {
 onDismiss: () => void;
}

export const SelectionHint = React.memo(function SelectionHint({ onDismiss }: SelectionHintProps) {
 const t = useTranslations('reader');
 const [isReturningUser, setIsReturningUser] = useState(false);
 const [tourComplete, setTourComplete] = useState(false);

 useEffect(() => {
 const returning = safeGetItem('read-pal-selection-used') === 'true';
 const tourDone = safeGetItem('read-pal-tour-complete') === 'true';
 setIsReturningUser(returning);
 setTourComplete(tourDone);
 // Returning users who already know how to select don't need this hint at all
 if (returning) {
  const timer = setTimeout(onDismiss, 3000);
  return () => clearTimeout(timer);
 }
 }, [onDismiss]);

 // Defer to FeatureTour when it's still running — tour step 2 already teaches selection
 if (!tourComplete) return null;

 return (
 <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 animate-fade-in" role="status" aria-live="polite" style={{ animation: 'fade-in 0.5s 1.5s forwards' }}>
  <div className={`px-4 py-2 rounded-xl text-white text-sm backdrop-blur-sm shadow-lg flex items-center gap-2 pointer-events-auto ${
  isReturningUser ? 'bg-amber-600/60' : 'bg-amber-600/80'
  }`}>
  <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
  <span>{isReturningUser ? t('selection_hint_tip') : t('selection_hint_new')}</span>
  <button type="button" onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label={t('dismiss_label')}>
   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
  </button>
  </div>
 </div>
 );
});
