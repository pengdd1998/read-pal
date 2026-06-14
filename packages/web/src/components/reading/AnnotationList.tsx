'use client';

import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import type { FilterTab } from './FilterTabs';
import { AnnotationCard } from './AnnotationCard';

interface AnnotationRowProps {
 annotation: Annotation;
 bulkMode: boolean;
 isSelected: boolean;
 bookTitle?: string;
 author?: string;
 onDelete: (id: string) => void;
 onUpdate: (updated: Annotation) => void;
 onClick: (annotation: Annotation) => void;
 onToggleSelect: (id: string) => void;
 selectLabel: string;
}

const AnnotationRow = React.memo(function AnnotationRow({
 annotation,
 bulkMode,
 isSelected,
 bookTitle,
 author,
 onDelete,
 onUpdate,
 onClick,
 onToggleSelect,
 selectLabel,
}: AnnotationRowProps) {
 return (
 <div className="relative">
  {bulkMode && (
  <div className="absolute top-1 left-0 z-10">
   <label className="flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer">
   <input
   type="checkbox"
   checked={isSelected}
   onChange={() => onToggleSelect(annotation.id)}
   aria-label={selectLabel}
   className="w-4 h-4 rounded border-surface-3 text-amber-500 focus:ring-amber-400 cursor-pointer"
   />
   </label>
  </div>
  )}
  <div className={bulkMode ? 'pl-7' : ''}>
  <AnnotationCard
   annotation={annotation}
   bookTitle={bookTitle}
   author={author}
   onDelete={onDelete}
   onUpdate={onUpdate}
   onClick={onClick}
  />
  </div>
 </div>
 );
});

interface AnnotationListProps {
 annotations: Annotation[];
 activeTab: FilterTab;
 bulkMode: boolean;
 selectedIds: Set<string>;
 bookTitle?: string;
 author?: string;
 onDelete: (id: string) => void;
 onUpdate: (updated: Annotation) => void;
 onScrollToAnnotation: (annotation: Annotation) => void;
 onToggleSelect: (id: string) => void;
}

export const AnnotationList = React.memo(function AnnotationList({
 annotations,
 activeTab,
 bulkMode,
 selectedIds,
 bookTitle,
 author,
 onDelete,
 onUpdate,
 onScrollToAnnotation,
 onToggleSelect,
}: AnnotationListProps) {
 const t = useTranslations('reader');

 const handleClick = useCallback((annotation: Annotation) => {
  if (bulkMode) {
   onToggleSelect(annotation.id);
  } else {
   onScrollToAnnotation(annotation);
  }
 }, [bulkMode, onToggleSelect, onScrollToAnnotation]);

 if (annotations.length === 0) {
 return (
  <div className="text-center py-12">
  <svg aria-hidden="true" className="w-10 h-10 mx-auto mb-3 text-surface-4 dark:text-surface-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
   {activeTab === 'bookmark' ? (
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
   ) : activeTab === 'note' ? (
    <>
     <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
     <path d="M14 2v6h6" />
     <path d="M8 13h8M8 17h5" />
    </>
   ) : activeTab === 'highlight' ? (
    <>
     <path d="m9 11-6 6v3h3l6-6" />
     <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </>
   ) : (
    <>
     <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
     <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
     <path d="M9 12h6M9 16h6" />
    </>
   )}
  </svg>
  <p className="text-sm text-amber-700/50 dark:text-amber-400/40">
   {activeTab === 'all'
   ? t('sidebar_empty_all')
   : activeTab === 'highlight'
   ? t('sidebar_empty_highlights')
   : activeTab === 'note'
   ? t('sidebar_empty_notes')
   : t('sidebar_empty_bookmarks')}
  </p>
  </div>
 );
 }

 return (
 <>
  {annotations.map((annotation) => (
  <AnnotationRow
   key={annotation.id}
   annotation={annotation}
   bulkMode={bulkMode}
   isSelected={selectedIds.has(annotation.id)}
   bookTitle={bookTitle}
   author={author}
   onDelete={onDelete}
   onUpdate={onUpdate}
   onClick={handleClick}
   onToggleSelect={onToggleSelect}
   selectLabel={t('sidebar_select_annotation')}
  />
  ))}
 </>
 );
});
