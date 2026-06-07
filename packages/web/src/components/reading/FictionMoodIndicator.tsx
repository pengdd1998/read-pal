import { useTranslations } from 'next-intl';
import { type MoodType, MOOD_COLORS, MOOD_ICONS } from './FictionPanel.utils';

interface FictionMoodIndicatorProps {
 mood: MoodType;
}

export function FictionMoodIndicator({ mood }: FictionMoodIndicatorProps) {
 const t = useTranslations('reader');

 return (
 <div className="px-4 py-3 border-b border-gray-100">
  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
  {t('fiction_chapter_mood')}
  </p>
  <div className="flex items-center gap-2">
  <div className={`w-3 h-3 rounded-full ${MOOD_COLORS[mood]}`} />
  <span className="text-sm text-gray-700">
   {MOOD_ICONS[mood]} {mood.charAt(0).toUpperCase() + mood.slice(1)}
  </span>
  </div>
 </div>
 );
}
