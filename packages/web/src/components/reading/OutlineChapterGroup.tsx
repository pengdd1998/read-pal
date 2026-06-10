'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { OutlineItem } from './OutlineItem';

interface ChapterGroup {
 chapterIndex: number;
 label: string;
 highlights: Annotation[];
 notes: Annotation[];
 bookmarks: Annotation[];
}

interface OutlineChapterGroupProps {
 chapter: ChapterGroup;
 isExpanded: boolean;
 onToggle: (chapterIndex: number) => void;
 onScrollToAnnotation: (annotation: Annotation) => void;
 noItemsLabel: string;
}

export const OutlineChapterGroup = memo(function OutlineChapterGroup({
 chapter,
 isExpanded,
 onToggle,
 onScrollToAnnotation,
 noItemsLabel,
}: OutlineChapterGroupProps) {
 const t = useTranslations('reader');
 const totalCount = chapter.highlights.length + chapter.notes.length + chapter.bookmarks.length;

 return (
 <div>
  <button
  onClick={() => onToggle(chapter.chapterIndex)}
  aria-expanded={isExpanded}
  aria-label={isExpanded ? t('outline_collapse', { label: chapter.label }) : t('outline_expand', { label: chapter.label })}
  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors text-left"
  >
  <svg aria-hidden="true"
   className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
   fill="none"
   viewBox="0 0 24 24"
   stroke="currentColor"
   strokeWidth={2}
  >
   <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
   {chapter.label}
  </span>
  <div className="flex items-center gap-1.5">
   {chapter.notes.length > 0 && (
   <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
    {t('outline_notes_count', { count: chapter.notes.length })}
   </span>
   )}
   {chapter.highlights.length > 0 && (
   <span className="text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded-full">
    {chapter.highlights.length}
   </span>
   )}
   {chapter.bookmarks.length > 0 && (
   <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">
    {chapter.bookmarks.length}
   </span>
   )}
  </div>
  </button>

  {isExpanded && (
  <div className="pb-2">
   {chapter.notes.map((note) => (
   <OutlineItem key={note.id} annotation={note} onClick={onScrollToAnnotation} />
   ))}
   {chapter.highlights.map((hl) => (
   <OutlineItem key={hl.id} annotation={hl} onClick={onScrollToAnnotation} />
   ))}
   {chapter.bookmarks.map((bm) => (
   <OutlineItem key={bm.id} annotation={bm} onClick={onScrollToAnnotation} />
   ))}
   {totalCount === 0 && (
   <p className="text-[10px] text-gray-400 px-8 py-1">{noItemsLabel}</p>
   )}
  </div>
  )}
 </div>
 );
});
