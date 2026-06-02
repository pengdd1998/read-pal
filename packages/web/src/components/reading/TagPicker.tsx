'use client';

import { useTranslations } from 'next-intl';
import { ANNOTATION_COLORS } from '@read-pal/shared';
import { QUICK_TAGS } from './SelectionToolbar.constants';

interface TagPickerProps {
  variant: 'mobile' | 'desktop';
  onTagSelect: (color: string, tag: string) => void;
}

export function TagPicker({ variant, onTagSelect }: TagPickerProps) {
  const t = useTranslations('reader');

  if (variant === 'mobile') {
    return (
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">{t('toolbar_quick_tag')}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_TAGS.map((qt) => (
            <button
              key={qt.id}
              onClick={() => onTagSelect(ANNOTATION_COLORS[0], qt.id)}
              aria-label={t(qt.labelKey)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 active:scale-95 transition-all hover:border-amber-300 dark:hover:border-amber-700"
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
    <div className="absolute top-full mt-2 left-0 bg-surface-0 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 min-w-[220px] z-10 animate-bounce-in">
      <p className="text-[10px] text-gray-400 mb-2 font-medium uppercase tracking-wider">{t('toolbar_quick_tag')}</p>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_TAGS.map((qt) => (
          <button
            key={qt.id}
            onClick={() => onTagSelect(ANNOTATION_COLORS[0], qt.id)}
            aria-label={t(qt.labelKey)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:scale-95 transition-all"
          >
            <span aria-hidden="true">{qt.emoji}</span>
            {t(qt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
