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

export const CreateClubForm = React.memo(function CreateClubForm({
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
 <form
  className="mb-4 p-4 rounded-xl bg-surface-1 space-y-3"
  onSubmit={(e) => { e.preventDefault(); if (newName.trim() && !creating) onCreate(); }}
 >
  <input
  type="text"
  autoComplete="off"
  placeholder={t('clubName')}
  aria-label={t('clubName')}
  value={newName}
  onChange={(e) => onNameChange(e.target.value)}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
  maxLength={100}
  enterKeyHint="done"
  />
  <textarea
  placeholder={t('descriptionOptional')}
  aria-label={t('descriptionOptional')}
  value={newDesc}
  onChange={(e) => onDescChange(e.target.value)}
  className="w-full px-3 py-2 rounded-lg border border-surface-3 bg-surface-0 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
  rows={2}
  maxLength={500}
  />
  <div className="flex items-center gap-2">
  <button type="submit"
   disabled={creating || !newName.trim()}
   className="text-xs px-4 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {creating ? t('creating') : t('createClub')}
  </button>
  <button type="button"
   onClick={onCancel}
   className="text-xs px-3 py-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {tc('cancel')}
  </button>
  </div>
 </form>
 );
});