'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SkeletonPulse } from './SkeletonPulse';
import { DashboardActionIcon, InsightIcon } from './DashboardIcons';
import type { InsightKey } from './CurrentReadingSection';

// Reading Streak sub-component
export const ReadingStreakCard = React.memo(function ReadingStreakCard({ streak, loading }: { streak: number; loading: boolean }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 flex items-center justify-center flex-shrink-0">
        {streak >= 7 ? (
          <svg aria-hidden="true" className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
     </svg>
        ) : streak >= 3 ? (
          <svg aria-hidden="true" className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
     </svg>
        ) : (
          <svg aria-hidden="true" className="w-6 h-6 text-orange-500 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums">
          {loading ? <SkeletonPulse className="h-8 w-10 inline-block" /> : streak}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('day_streak')}</div>
      </div>
      {streak === 0 && !loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('start_streak')}</p>
      )}
      {streak >= 3 && !loading && (
        <div className="text-right">
          <p className="text-xs text-orange-500 dark:text-orange-400 font-medium">{t('keep_going')}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">{t('next_milestone', { days: streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : 60 })}</p>
        </div>
      )}
    </div>
  );
});

// Quick Actions sub-component
export const QuickActions = React.memo(function QuickActions() {
  const t = useTranslations('dashboard');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {[
        { label: t('quick_upload'), href: '/library', icon: 'upload', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_memory_books'), href: '/memory-books', icon: 'book', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_flashcards'), href: '/flashcards', icon: 'cards', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_stats'), href: '/stats', icon: 'chart', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
        { label: t('quick_book_clubs'), href: '/book-clubs', icon: 'books', color: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20' },
      ].map((action) => (
        <Link
          key={action.label}
          href={action.href}
          prefetch={false}
          className={`card flex flex-col items-center gap-2 py-4 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200 bg-gradient-to-br ${action.color}`}
        >
          <DashboardActionIcon type={action.icon} />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
        </Link>
      ))}
    </div>
  );
});

// Insight Card sub-component
export const InsightCard = React.memo(function InsightCard({ insightKey }: { insightKey: InsightKey | null }) {
  const t = useTranslations('dashboard');

  return (
    <div className="card border-l-4 border-l-primary-400 dark:border-l-primary-600">
      <div className="flex items-start gap-3">
        <InsightIcon type={insightKey?.icon ?? ''} />
        <div>
          <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest">
            {insightKey ? t(insightKey.agentKey) : ''}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
            {insightKey ? t(insightKey.key) : ''}
          </p>
        </div>
      </div>
    </div>
  );
});
