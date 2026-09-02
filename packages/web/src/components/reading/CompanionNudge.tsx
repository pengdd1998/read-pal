'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { safeGetItem, safeSetItem } from '@/lib/safe-storage';
import { warn } from '@/lib/logger';

export const CompanionNudge = React.memo(function CompanionNudge() {
 const t = useTranslations('reader');
 const [visible, setVisible] = useState(false);

 useEffect(() => {
 const tourDone = safeGetItem('read-pal-tour-complete') === 'true';
 const chatOpened = safeGetItem('read-pal-chat-opened') === 'true';
 const nudgeDismissed = safeGetItem('read-pal-companion-nudge') === 'true';
 if (tourDone && !chatOpened && !nudgeDismissed) {
  const timer = setTimeout(() => setVisible(true), 4000);
  return () => clearTimeout(timer);
 }
 }, []);

 const handleDismiss = () => {
 setVisible(false);
 try { safeSetItem('read-pal-companion-nudge', 'true'); } catch (err) { warn('CompanionNudge: localStorage write failed', err); }
 };

 if (!visible) return null;

 return (
 <div className="fixed bottom-24 right-6 z-10 animate-fade-in max-w-[220px]" role="status" aria-live="polite">
  <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 rounded-xl border border-amber-200/60 dark:border-amber-800/40 p-3 shadow-lg">
  <div className="flex items-start gap-2">
   <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-emerald-500 flex items-center justify-center flex-shrink-0">
   <svg aria-hidden="true" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
   </svg>
   </div>
   <div className="flex-1 min-w-0">
   <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('companion_nudge_title')}</p>
   <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60 mt-0.5">{t('companion_nudge_desc')}</p>
   </div>
   <button type="button" onClick={handleDismiss} className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 flex-shrink-0 -mt-0.5 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label={t('dismiss_label')}>
   <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>
  </div>
 </div>
 );
});
