'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { CollectionIcon } from './CollectionIcon';

export const DEFAULT_COLORS = [
 '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
 '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

interface CollectionCreateFormProps {
 newName: string;
 newIcon: string;
 newColor: string;
 icons: { value: string; label: string }[];
 creating?: boolean;
 onNameChange: (name: string) => void;
 onIconChange: (icon: string) => void;
 onColorChange: (color: string) => void;
 onCreate: () => void;
 onCancel: () => void;
}

export const CollectionCreateForm = React.memo(function CollectionCreateForm({
 newName,
 newIcon,
 newColor,
 icons,
 creating = false,
 onNameChange,
 onIconChange,
 onColorChange,
 onCreate,
 onCancel,
}: CollectionCreateFormProps) {
 const t = useTranslations('library');

 return (
 <div className="mb-3 p-3 bg-surface-0 border border-surface-3 rounded-xl space-y-2 animate-slide-up">
  <input
  type="text"
  value={newName}
  onChange={(e) => onNameChange(e.target.value)}
  onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') onCancel(); }}
  placeholder={t('collections_name_placeholder')}
  aria-label={t('collections_name_placeholder')}
  className="w-full px-2.5 py-1.5 text-sm bg-surface-1 border border-surface-3 rounded-lg outline-none focus:ring-1 focus:ring-primary-400/50"
  autoFocus
  />
  {/* Icon picker */}
  <div className="flex flex-wrap gap-1">
  {icons.map((ic) => (
   <button type="button"
   key={ic.value}
   onClick={() => onIconChange(ic.value)}
   aria-label={t('select_icon', { label: ic.label })}
   className={`p-1.5 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${newIcon === ic.value ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-surface-1'}`}
   title={ic.label}
   >
   <CollectionIcon icon={ic.value} color={newIcon === ic.value ? '#f59e0b' : 'currentColor'} />
   </button>
  ))}
  </div>
  {/* Color picker */}
  <div className="flex items-center gap-1.5">
  {DEFAULT_COLORS.map((c) => (
   <button type="button"
   key={c}
   onClick={() => onColorChange(c)}
   aria-label={t('select_color', { color: c })}
   className={`w-5 h-5 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-amber-400 ${newColor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600' : 'hover:scale-110'}`}
   style={{ backgroundColor: c }}
   />
  ))}
  </div>
  <div className="flex gap-2">
  <button type="button"
   onClick={onCreate}
   disabled={!newName.trim() || creating}
   className="flex-1 px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   {t('collections_create')}
  </button>
  <button type="button"
   onClick={onCancel}
   className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
  >
   {t('collections_cancel')}
  </button>
  </div>
 </div>
 );
});
