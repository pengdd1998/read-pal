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

export function JoinClubForm({
 joinCode,
 joining,
 onCodeChange,
 onJoin,
 onCancel,
}: JoinClubFormProps) {
 const t = useTranslations('bookClubs');

 return (
 <div className="mb-4 p-4 rounded-xl bg-gray-50/50 space-y-3">
  <input
  type="text"
  placeholder={t('enterCode')}
  aria-label={t('enterCode')}
  value={joinCode}
  onChange={(e) => onCodeChange(e.target.value.toUpperCase().slice(0, 6))}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 tracking-widest text-center font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
  maxLength={6}
  />
  <div className="flex items-center gap-2">
  <button
   onClick={onJoin}
   disabled={joining || joinCode.length < 6}
   className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
  >
   {joining ? t('joining') : t('joinClub')}
  </button>
  <button
   onClick={onCancel}
   className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700"
  >
   Cancel
  </button>
  </div>
 </div>
 );
}
