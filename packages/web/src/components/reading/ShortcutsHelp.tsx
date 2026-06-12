'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ShortcutsHelpProps {
 onClose: () => void;
}

export const ShortcutsHelp = React.memo(function ShortcutsHelp({ onClose }: ShortcutsHelpProps) {
 const t = useTranslations('reader');
 const shortcuts = [
 { keys: ['←', '→'], label: t('shortcut_prev_next') },
 { keys: ['H'], label: t('shortcut_highlight') },
 { keys: ['B'], label: t('shortcut_bookmark') },
 { keys: ['T'], label: t('shortcut_toc') },
 { keys: ['Esc'], label: t('shortcut_close') },
 ];

 return (
 <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('close_dialog')}>
  <div className="bg-surface-0 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
  <div className="flex items-center justify-between mb-4">
   <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">{t('keyboard_shortcuts_title')}</h3>
   <button type="button" onClick={onClose} className="p-2 -m-1 rounded-lg hover:bg-surface-1 text-gray-500 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={t('close_label')}>
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
   </svg>
   </button>
  </div>
  <div className="space-y-2.5">
   {shortcuts.map((s) => (
   <div key={s.label} className="flex items-center justify-between">
    <span className="text-xs text-gray-600 dark:text-gray-400">{s.label}</span>
    <div className="flex gap-1">
    {s.keys.map((k) => (
     <kbd key={k} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-1 text-gray-700 border border-surface-3">{k}</kbd>
    ))}
    </div>
   </div>
   ))}
  </div>
  <p className="mt-4 text-[10px] text-gray-500 text-center">{t('swipe_hint')}</p>
  </div>
 </div>
 );
});
