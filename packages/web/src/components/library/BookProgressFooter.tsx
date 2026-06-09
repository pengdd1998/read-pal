'use client';

import React, { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface BookProgressFooterProps {
 status: 'unread' | 'reading' | 'completed';
 progress: number;
 currentPage: number;
 totalPages: number;
 lastReadAt?: Date | string;
}

export const BookProgressFooter = React.memo(function BookProgressFooter({
 status,
 progress,
 currentPage,
 totalPages,
 lastReadAt,
}: BookProgressFooterProps) {
 const t = useTranslations('library');
 const locale = useLocale();

 const STATUS_CONFIG = useMemo(() => ({
 unread: { label: t('card_unread'), ring: 'bg-surface-1 text-gray-600 dark:text-gray-400' },
 reading: { label: t('card_reading'), ring: 'bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300' },
 completed: { label: t('card_completed'), ring: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
 } as const), [t]);

 const cfg = STATUS_CONFIG[status];

 const formattedDate = useMemo(() => lastReadAt
 ? new Date(lastReadAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
 : null, [lastReadAt, locale]);

 return (
 <>
  {/* Status Badge */}
  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase w-fit ${cfg.ring}`}>
  {cfg.label}
  </span>

  {/* Progress details */}
  {status !== 'unread' && (
  <div className="mt-auto pt-3">
   <div className="w-full bg-surface-1 rounded-full h-1.5 overflow-hidden">
   <div
    className={`h-full rounded-full transition-all duration-500 ease-out ${
    status === 'completed' ? 'bg-emerald-500' : 'bg-primary-500'
    }`}
    style={{ width: `${Math.min(100, progress)}%` }}
   />
   </div>
   <div className="flex items-center justify-between mt-1.5">
   <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
    {t('card_pages', { current: currentPage, total: totalPages })}
   </p>
   <p className="text-[10px] text-primary-500 font-semibold tabular-nums">
    {progress}%
   </p>
   </div>
  </div>
  )}

  {/* Last read */}
  {formattedDate && (
  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
   {formattedDate}
  </p>
  )}
 </>
 );
});