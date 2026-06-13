'use client';

import React from 'react';
import { getBookInitials, getBookCoverColors } from '@/lib/book-cover';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface ClubMember {
 id: string;
 userId: string;
 role: string;
}

export interface BookClub {
 id: string;
 name: string;
 description?: string;
 coverImage?: string;
 isPrivate: boolean;
 inviteCode: string;
 maxMembers: number;
 currentBookId?: string;
 currentUserRole: string;
 // The dashboard list endpoint returns `memberCount` (a number) — not the
 // member rows. Detail endpoints may include `clubMembers`, so fall back to
 // its length when present (e.g. on the club detail page).
 memberCount?: number;
 clubMembers?: ClubMember[];
 currentBook?: {
 id: string;
 title: string;
 author: string;
 coverUrl?: string;
 progress: number;
 };
}

export const BookClubCard = React.memo(function BookClubCard({ club }: { club: BookClub }) {
 const t = useTranslations('bookClubs');
 // Prefer the API's aggregate `memberCount` (returned by the list endpoint);
 // fall back to the member rows when present (detail page).
 const memberCount = club.memberCount ?? (club.clubMembers?.length ?? 0);

 return (
 <Link
  key={club.id}
  href={`/book-clubs/${club.id}`}
  className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-1 transition-colors group focus-visible:ring-2 focus-visible:ring-amber-400"
 >
  {/* Club avatar */}
  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getBookCoverColors(club.name)[0]} flex items-center justify-center shrink-0`}>
   <span className={`text-xs font-bold ${getBookCoverColors(club.name)[1]}`}>{getBookInitials(club.name)}</span>
  </div>

  <div className="flex-1 min-w-0">
  <div className="flex items-center gap-2">
   <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
   {club.name}
   </span>
   {club.isPrivate && (
   <svg aria-hidden="true" className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
   </svg>
   )}
   {club.currentUserRole === 'admin' && (
   <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
    {t('adminBadge')}
   </span>
   )}
  </div>
  <div className="flex items-center gap-3 mt-0.5">
   <span className="text-xs text-gray-500 dark:text-gray-400">
   {memberCount !== 1
     ? t('memberCountPlural', { count: memberCount })
     : t('memberCount', { count: 1 })}
   </span>
   {club.currentBookId && (
   <span className="text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1">
    <span className="w-1 h-1 rounded-full bg-green-500" />
    {t('reading')}
   </span>
   )}
  </div>
  </div>

  {/* Chevron */}
  <svg aria-hidden="true" className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
 </Link>
 );
});
