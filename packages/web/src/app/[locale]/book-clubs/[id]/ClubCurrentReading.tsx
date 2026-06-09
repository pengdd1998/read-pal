'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isDisplayableAuthor } from '@/lib/book-cover';
import type { ClubDetail, MemberProgress } from './types';

interface ClubCurrentReadingProps {
 club: ClubDetail;
 progress: MemberProgress[];
 isAdmin: boolean;
}

export const ClubCurrentReading = React.memo(function ClubCurrentReading({ club, progress, isAdmin }: ClubCurrentReadingProps) {
 const t = useTranslations('bookClubs');

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6 shadow-sm mb-6">
  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
  <span className="text-lg">{'📖'}</span>
  {t('currentlyReading')}
  </h2>
  {club.currentBook ? (
  <div>
   <div className="flex items-center gap-3 mb-4">
   <div className="w-10 h-14 rounded bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-lg">
    {'📕'}
   </div>
   <div>
    <p className="font-semibold text-gray-900 dark:text-gray-100">{club.currentBook.title}</p>
    {isDisplayableAuthor(club.currentBook.author) && <p className="text-sm text-gray-500 dark:text-gray-400">{club.currentBook.author}</p>}
   </div>
   </div>

   {/* Group progress */}
   {progress.length > 0 && (
   <div className="space-y-2">
    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('groupProgress')}</p>
    {progress.map((p) => (
    <div key={p.userId} className="flex items-center gap-3">
     <span className="text-sm text-gray-700 dark:text-gray-300 w-24 truncate">
     {p.user?.name || t('memberName')}
     </span>
     <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
     <div
      className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all"
      style={{ width: `${Math.min(p.progress, 100)}%` }}
     />
     </div>
     <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-10 text-right">
     {p.progress}%
     </span>
    </div>
    ))}
   </div>
   )}
  </div>
  ) : (
  <div className="text-center py-6">
   <p className="text-sm text-gray-400">
   {isAdmin ? t('setBookPrompt') : t('noBookSelected')}
   </p>
   {isAdmin && (
   <Link
    href="/library"
    className="text-sm text-primary-600 hover:underline mt-1 inline-block"
   >
    {t('chooseFromLibrary')}
   </Link>
   )}
  </div>
  )}
 </div>
 );
});
