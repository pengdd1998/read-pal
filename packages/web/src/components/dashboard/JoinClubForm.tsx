'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface JoinClubFormProps {
 joinCode: string;
 joining: boolean;
 onCodeChange: (code: string) => void;
 onJoin: () => void;
 onCancel: () => void;
}

export const JoinClubForm = React.memo(function JoinClubForm({
 joinCode,
 joining,
 onCodeChange,
 onJoin,
 onCancel,
}: JoinClubFormProps) {
 const t = useTranslations('bookClubs');

 return (
 <div className="mb-4 p-4 rounded-xl bg-surface-1 space-y-3">
  <input
  type="text"
  placeholder={t('enterCode')}
  aria-label={t('enterCode')}
  value={joinCode}
  onChange={(e) => onCodeChange(e.target.value.toUpperCase().slice(0, 6))}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 dark:text-gray-100 tracking-widest text-center font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
  maxLength={6}
  />
  <div className="flex items-center gap-2">
  <button type="button"
   onClick={onJoin}
   disabled={joining || joinCode.length < 6}
   className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {joining ? t('joining') : t('joinClub')}
  </button>
  <button type="button"
   onClick={onCancel}
   className="text-xs px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {t('cancel')}
  </button>
  </div>
 </div>
 );
});