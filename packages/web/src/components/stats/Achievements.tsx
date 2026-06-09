'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { ReadingStats } from './types';

interface AchievementsProps {
 stats: ReadingStats;
}

export const Achievements = React.memo(function Achievements({ stats }: AchievementsProps) {
 const t = useTranslations('stats');

 const badges = useMemo(() => [
 { icon: '📖', title: t('achievement_first_book'), desc: t('achievement_first_book_desc'), unlocked: (stats.booksRead || 0) >= 1 },
 { icon: '🔥', title: t('achievement_on_fire'), desc: t('achievement_on_fire_desc'), unlocked: (stats.readingStreak || 0) >= 7 },
 { icon: '💡', title: t('achievement_curious_mind'), desc: t('achievement_curious_mind_desc'), unlocked: (stats.conceptsLearned || 0) >= 10 },
 { icon: '🎯', title: t('achievement_bookworm'), desc: t('achievement_bookworm_desc'), unlocked: (stats.booksRead || 0) >= 5 },
 { icon: '⏱️', title: t('achievement_deep_reader'), desc: t('achievement_deep_reader_desc'), unlocked: (() => { const h = stats.totalTime?.match(/(\d+)h/); return h ? parseInt(h[1]) >= 10 : false; })() },
 { icon: '🤝', title: t('achievement_social_reader'), desc: t('achievement_social_reader_desc'), unlocked: (stats.chatMessageCount || 0) >= 1 },
 { icon: '📒', title: t('achievement_memory_keeper'), desc: t('achievement_memory_keeper_desc'), unlocked: (stats.memoryBookCount || 0) >= 1 },
 { icon: '🏆', title: t('achievement_champion'), desc: t('achievement_champion_desc'), unlocked: (stats.booksRead || 0) >= 10 },
 ], [stats, t]);

 return (
 <div className="bg-surface-0 rounded-xl border border-surface-3 p-6">
  <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">{t('achievements_title')}</h2>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {badges.map((badge) => (
   <div
   key={badge.title}
   className={`rounded-xl p-3 text-center transition-all ${
    badge.unlocked
    ? 'bg-gradient-to-br from-amber-50 to-teal-50 dark:from-amber-900/10 dark:to-teal-900/10 border border-amber-200 dark:border-amber-800'
    : 'bg-gray-50/50 dark:bg-gray-800/50 opacity-50'
   }`}
   >
   <div className={`text-2xl mb-1 ${badge.unlocked ? '' : 'grayscale'}`}>{badge.icon}</div>
   <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{badge.title}</div>
   <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{badge.desc}</div>
   </div>
  ))}
  </div>
 </div>
 );
});
