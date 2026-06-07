'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface CreateClubFormProps {
 newName: string;
 newDesc: string;
 creating: boolean;
 onNameChange: (name: string) => void;
 onDescChange: (desc: string) => void;
 onCreate: () => void;
 onCancel: () => void;
}

export function CreateClubForm({
 newName,
 newDesc,
 creating,
 onNameChange,
 onDescChange,
 onCreate,
 onCancel,
}: CreateClubFormProps) {
 const t = useTranslations('bookClubs');
 const tc = useTranslations('common');

 return (
 <div className="mb-4 p-4 rounded-xl bg-gray-50/50 space-y-3">
  <input
  type="text"
  placeholder={t('clubName')}
  aria-label={t('clubName')}
  value={newName}
  onChange={(e) => onNameChange(e.target.value)}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
  maxLength={100}
  />
  <textarea
  placeholder={t('descriptionOptional')}
  aria-label={t('descriptionOptional')}
  value={newDesc}
  onChange={(e) => onDescChange(e.target.value)}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
  rows={2}
  maxLength={500}
  />
  <div className="flex items-center gap-2">
  <button
   onClick={onCreate}
   disabled={creating || !newName.trim()}
   className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
  >
   {creating ? t('creating') : t('createClub')}
  </button>
  <button
   onClick={onCancel}
   className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-700"
  >
   {tc('cancel')}
  </button>
  </div>
 </div>
 );
}
