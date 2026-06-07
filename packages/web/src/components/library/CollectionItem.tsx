'use client';

import { useTranslations } from 'next-intl';
import type { Collection } from '@read-pal/shared';
import { CollectionIcon } from './CollectionIcon';

interface CollectionItemProps {
 collection: Collection;
 isActive: boolean;
 isEditing: boolean;
 editName: string;
 onSelect: () => void;
 onEditNameChange: (name: string) => void;
 onRename: () => void;
 onStartEdit: () => void;
 onDelete: () => void;
 onCancelEdit: () => void;
}

export function CollectionItem({
 collection: col,
 isActive,
 isEditing,
 editName,
 onSelect,
 onEditNameChange,
 onRename,
 onStartEdit,
 onDelete,
 onCancelEdit,
}: CollectionItemProps) {
 const t = useTranslations('library');

 if (isEditing) {
 return (
  <div className="group relative">
  <div className="flex items-center gap-1.5 px-3 py-2">
   <input
   type="text"
   value={editName}
   onChange={(e) => onEditNameChange(e.target.value)}
   onKeyDown={(e) => { if (e.key === 'Enter') onRename(); if (e.key === 'Escape') onCancelEdit(); }}
   onBlur={() => onRename()}
   aria-label={t('collections_name_placeholder')}
   className="flex-1 px-2 py-1 text-sm bg-gray-50 border border-surface-3 rounded outline-none focus:ring-1 focus:ring-primary-400/50"
   autoFocus
   />
  </div>
  </div>
 );
 }

 return (
 <div className="group relative">
  <div
  role="button"
  tabIndex={0}
  onClick={onSelect}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
   isActive
   ? 'bg-primary-50 dark:bg-primary-900/20 font-medium'
   : 'text-gray-600 hover:bg-gray-100'
  }`}
  style={isActive ? { color: col.color || 'rgb(245, 158, 11)' } : undefined}
  >
  <CollectionIcon icon={col.icon || 'folder'} color={col.color || 'rgb(245, 158, 11)'} />
  <span className="flex-1 text-left truncate">{col.name}</span>
  <span className="text-[10px] text-gray-400">{col.bookCount ?? (col.bookIds || []).length}</span>
  {/* Hover actions */}
  <div className="hidden md:group-hover:flex items-center gap-0.5">
   <button
   onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
   className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-gray-400 hover:text-gray-600"
   title={t('collections_rename')}
   aria-label={t('collections_rename')}
   >
   <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
   </svg>
   </button>
   <button
   onClick={(e) => { e.stopPropagation(); onDelete(); }}
   className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded text-gray-400 hover:text-red-500"
   title={t('collections_delete')}
   aria-label={t('collections_delete')}
   >
   <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
   </svg>
   </button>
  </div>
  </div>
 </div>
 );
}
