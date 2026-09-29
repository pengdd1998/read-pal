'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { ClubMember } from './types';

interface MemberRowProps {
  member: ClubMember;
  memberInitial: string;
  displayName: string;
  isAdmin: boolean;
  isModerator: boolean;
  adminLabel: string;
  modLabel: string;
}

const MemberRow = React.memo(function MemberRow({
  member,
  memberInitial,
  displayName,
  isAdmin,
  isModerator,
  adminLabel,
  modLabel,
}: MemberRowProps) {
  return (
   <div
   key={member.id}
   className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-1 transition-colors"
   >
   <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-sm font-bold text-primary-700 dark:text-primary-300">
    {memberInitial}
   </div>
   <div className="flex-1 min-w-0">
    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
    {displayName}
    </span>
   </div>
   {isAdmin && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
    {adminLabel}
    </span>
   )}
   {isModerator && (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
    {modLabel}
    </span>
   )}
   </div>
  );
});

interface ClubMembersListProps {
  members: ClubMember[];
  memberCount: number;
}

export const ClubMembersList = React.memo(function ClubMembersList({ members, memberCount }: ClubMembersListProps) {
  const t = useTranslations('bookClubs');

  return (
  <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6 shadow-sm mb-6">
   <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
   <svg aria-hidden="true" className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
   {t('membersTitle', { count: memberCount })}
   </h2>
   <div className="space-y-2">
   {members.map((member) => (
    <MemberRow
    key={member.id}
    member={member}
    memberInitial={(member.user?.name || 'M')[0].toUpperCase()}
    displayName={member.user?.name || t('memberName')}
    isAdmin={member.role === 'admin'}
    isModerator={member.role === 'moderator'}
    adminLabel={t('admin')}
    modLabel={t('mod')}
    />
   ))}
   </div>
  </div>
  );
});
