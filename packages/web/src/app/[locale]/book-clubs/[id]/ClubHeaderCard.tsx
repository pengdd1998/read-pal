'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ClubDetail } from './types';

interface ClubHeaderCardProps {
  club: ClubDetail;
  memberCount: number;
}

export function ClubHeaderCard({ club, memberCount }: ClubHeaderCardProps) {
  const t = useTranslations('bookClubs');
  const [copiedCode, setCopiedCode] = useState(false);

  function copyInviteCode() {
    navigator.clipboard.writeText(club.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-surface-0 p-6 shadow-sm mb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center text-2xl">
              {'📚'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {club.name}
                {club.isPrivate && (
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                )}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {memberCount === 1 ? t('memberCount', { count: memberCount }) : t('memberCountPlural', { count: memberCount })} &middot; {t('max', { count: club.maxMembers })}
              </p>
            </div>
          </div>
          {club.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
              {club.description}
            </p>
          )}
        </div>
      </div>

      {/* Invite code */}
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">{t('inviteCode')}</span>
        <button
          onClick={copyInviteCode}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary-400 transition-colors"
        >
          <code className="text-sm font-mono font-bold tracking-widest text-gray-700 dark:text-gray-300">
            {club.inviteCode}
          </code>
          <span className="text-[10px] text-gray-400">
            {copiedCode ? t('copied') : t('copy')}
          </span>
        </button>
      </div>
    </div>
  );
}
