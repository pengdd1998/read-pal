import React from 'react';
import { useTranslations } from 'next-intl';
import { type MoodType, MOOD_COLORS, MOOD_ICONS } from './FictionPanel.utils';

interface FictionMoodIndicatorProps {
 mood: MoodType;
}

export const FictionMoodIndicator = React.memo(function FictionMoodIndicator({ mood }: FictionMoodIndicatorProps) {
 const t = useTranslations('reader');

 return (
 <div className="px-4 py-3 border-b border-surface-2">
  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
  {t('fiction_chapter_mood')}
  </p>
  <div className="flex items-center gap-2" role="status" aria-label={t(`fiction_mood_${mood}`)}>
  <div className={`w-3 h-3 rounded-full ${MOOD_COLORS[mood]}`} aria-hidden="true" />
  <span className="text-sm text-gray-700 dark:text-gray-300">
   {MOOD_ICONS[mood]} {t(`fiction_mood_${mood}`)}
  </span>
  </div>
 </div>
 );
});
