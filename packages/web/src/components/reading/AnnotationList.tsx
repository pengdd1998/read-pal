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
  <div className="text-4xl opacity-30 mb-3">
   {activeTab === 'bookmark' ? '\u{1F516}' : activeTab === 'note' ? '\u{1F4DD}' : activeTab === 'highlight' ? '\u{1F58D}' : '\u{1F4CB}'}
  </div>
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
