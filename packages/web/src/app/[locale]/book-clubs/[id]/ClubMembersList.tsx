'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { ClubMember } from './types';

interface ClubMembersListProps {
 members: ClubMember[];
 memberCount: number;
}

export const ClubMembersList = React.memo(function ClubMembersList({ members, memberCount }: ClubMembersListProps) {
 const t = useTranslations('bookClubs');

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6 shadow-sm mb-6">
  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
  <span className="text-lg">{'👥'}</span>
  {t('membersTitle', { count: memberCount })}
  </h2>
  <div className="space-y-2">
  {members.map((member) => (
   <div
   key={member.id}
   className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
   >
   <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
    {(member.user?.name || 'M')[0].toUpperCase()}
   </div>
   <div className="flex-1 min-w-0">
    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
    {member.user?.name || t('memberName')}
    </span>
   </div>
   {member.role === 'admin' && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
    {t('admin')}
    </span>
   )}
   {member.role === 'moderator' && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
    {t('mod')}
    </span>
   )}
   </div>
  ))}
  </div>
 </div>
 );
});
