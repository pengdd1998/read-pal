'use client';

import React from 'react';
import type { AnnotationItem } from '@/types/book';

interface AnnotationRowProps {
 ann: AnnotationItem;
 type: 'note' | 'highlight' | 'bookmark';
 bookmarkLabel: string;
}

export const AnnotationRow = React.memo(function AnnotationRow({ ann, type, bookmarkLabel }: AnnotationRowProps) {
 const icon = type === 'note' ? '\u{1F4DD}' : type === 'highlight' ? '\u{1F58D}' : '\u{1F516}';
 const hoverBg = type === 'note'
  ? 'hover:bg-blue-50 dark:hover:bg-blue-900/5'
  : type === 'highlight'
   ? 'hover:bg-amber-50 dark:hover:bg-amber-900/5'
   : 'hover:bg-violet-50 dark:hover:bg-violet-900/5';
 const contentColor = type === 'note'
  ? 'text-xs font-medium text-blue-700 dark:text-blue-300 line-clamp-3'
  : 'text-xs text-gray-600 dark:text-gray-400 line-clamp-2';

 return (
  <div className={`px-7 py-2 ${hoverBg} transition-colors`}>
   <div className="flex items-start gap-2">
    <span className="text-[10px] mt-0.5 flex-shrink-0">{icon}</span>
    <div className="flex-1 min-w-0">
     <p className={contentColor}>
      {type === 'bookmark' && !ann.content ? bookmarkLabel : ann.content}
     </p>
     {ann.note && (
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 italic line-clamp-1">
       {ann.note}
      </p>
     )}
     {type === 'note' && ann.tags && ann.tags.length > 0 && (
      <div className="flex gap-1 mt-1">
       {ann.tags.slice(0, 3).map((tag) => (
        <span
         key={tag}
         className="text-[9px] bg-surface-1 text-gray-500 dark:text-gray-400 px-1 py-0.5 rounded"
        >
         {tag}
        </span>
       ))}
      </div>
     )}
    </div>
   </div>
  </div>
 );
});
