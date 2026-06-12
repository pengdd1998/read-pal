'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { QUICK_TAGS } from './SelectionToolbar.constants';

interface TagPickerProps {
 variant: 'mobile' | 'desktop';
 onTagSelect: (color: string, tag: string) => void;
}

export const TagPicker = React.memo(function TagPicker({ variant, onTagSelect }: TagPickerProps) {
 const t = useTranslations('reader');

 if (variant === 'mobile') {
 return (
  <div className="px-4 py-3 border-t border-surface-2">
  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium uppercase tracking-wider">{t('toolbar_quick_tag')}</p>
  <div className="flex flex-wrap gap-2">
   {QUICK_TAGS.map((qt) => (
   <button type="button"
    key={qt.id}
    onClick={() => onTagSelect(ANNOTATION_COLORS[0], qt.id)}
    aria-label={t(qt.labelKey)}
    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-1 border border-surface-3 text-xs font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-all hover:border-amber-300 dark:hover:border-amber-700 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
   >
    <span aria-hidden="true">{qt.emoji}</span>
    {t(qt.labelKey)}
   </button>
   ))}
  </div>
  </div>
 );
 }

 return (
 <div className="absolute top-full mt-2 left-0 bg-surface-0 border border-surface-3 rounded-xl shadow-lg p-3 min-w-[220px] z-10 animate-bounce-in">
  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2 font-medium uppercase tracking-wider">{t('toolbar_quick_tag')}</p>
  <div className="flex flex-wrap gap-1.5">
  {QUICK_TAGS.map((qt) => (
   <button type="button"
   key={qt.id}
   onClick={() => onTagSelect(ANNOTATION_COLORS[0], qt.id)}
   aria-label={t(qt.labelKey)}
   className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:scale-95 transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 min-h-[44px]"
   >
   <span aria-hidden="true">{qt.emoji}</span>
   {t(qt.labelKey)}
   </button>
  ))}
  </div>
 </div>
 );
});
