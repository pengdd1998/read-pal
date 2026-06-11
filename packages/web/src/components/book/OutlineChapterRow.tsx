'use client';

import React from 'react';
import type { OutlineChapter } from '@/types/book';
import { AnnotationRow } from './AnnotationRow';

interface OutlineChapterRowProps {
 chapter: OutlineChapter;
 isExpanded: boolean;
 onToggle: () => void;
 noteCountLabel: string;
 noteCountPluralLabel: string;
 bookmarkLabel: string;
 noMatchingLabel: string;
}

export const OutlineChapterRow = React.memo(function OutlineChapterRow({
 chapter,
 isExpanded,
 onToggle,
 noteCountLabel,
 noteCountPluralLabel,
 bookmarkLabel,
 noMatchingLabel,
}: OutlineChapterRowProps) {
 const totalCount = chapter.highlights.length + chapter.notes.length + chapter.bookmarks.length;

 return (
  <div>
   <button type="button"
    onClick={onToggle}
    className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50/50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    <svg aria-hidden="true"
     className={`w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
     fill="none"
     viewBox="0 0 24 24"
     stroke="currentColor"
     strokeWidth={2}
    >
     <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
    <span className="text-sm font-medium text-gray-700 flex-1">
     {chapter.label}
    </span>
    <div className="flex items-center gap-1.5">
     {chapter.notes.length > 0 && (
      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
       {chapter.notes.length === 1 ? noteCountLabel : noteCountPluralLabel}
      </span>
     )}
     {chapter.highlights.length > 0 && (
      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full">
       {chapter.highlights.length}
      </span>
     )}
    </div>
   </button>
   {isExpanded && (
    <div className="pb-2">
     {chapter.notes.map((ann) => (
      <AnnotationRow key={ann.id} ann={ann} type="note" bookmarkLabel={bookmarkLabel} />
     ))}
     {chapter.highlights.map((ann) => (
      <AnnotationRow key={ann.id} ann={ann} type="highlight" bookmarkLabel={bookmarkLabel} />
     ))}
     {chapter.bookmarks.map((ann) => (
      <AnnotationRow key={ann.id} ann={ann} type="bookmark" bookmarkLabel={bookmarkLabel} />
     ))}
     {totalCount === 0 && (
      <p className="text-[10px] text-gray-500 px-7 py-1">{noMatchingLabel}</p>
     )}
    </div>
   )}
  </div>
 );
});
