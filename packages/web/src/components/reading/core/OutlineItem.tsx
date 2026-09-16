'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';

const TYPE_ICONS: Record<string, string> = {
 highlight: '\u{1F58D}',
 note: '\u{1F4DD}',
 bookmark: '\u{1F516}',
};

const TAG_COLORS: Record<string, string> = {
 discuss: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
 important: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
 question: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
 key_idea: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
 surprising: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

const DEFAULT_TAG_COLOR = 'bg-surface-1 text-gray-600 dark:text-gray-400';

export const OutlineItem = memo(function OutlineItem({
 annotation,
 onClick,
}: {
 annotation: Annotation;
 onClick: (annotation: Annotation) => void;
}) {
 const t = useTranslations('reader');
 const loc = annotation.location as unknown as Record<string, unknown> | undefined;
 const pageRef = loc?.pageNumber ? t('page_ref', { number: loc.pageNumber as number }) : '';

 return (
 <button type="button"
  onClick={() => onClick(annotation)}
  aria-label={t('outline_item_aria', { type: annotation.type })}
  className="w-full text-left px-6 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors group min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
 >
  <div className="flex items-start gap-2">
  <span className="text-[10px] mt-0.5 flex-shrink-0">
   {TYPE_ICONS[annotation.type] || '•'}
  </span>
  <div className="flex-1 min-w-0">
   <p className={`text-xs leading-relaxed ${
   annotation.type === 'note'
    ? 'font-medium text-blue-700 dark:text-blue-300'
    : annotation.type === 'bookmark'
    ? 'text-purple-600 dark:text-purple-400'
    : 'text-gray-600 dark:text-gray-400'
   } ${annotation.type === 'highlight' ? 'line-clamp-2' : 'line-clamp-3'}`}>
   {annotation.type === 'highlight' && annotation.color && (
    <span
    aria-hidden="true"
    className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
    style={{ backgroundColor: annotation.color }}
    />
   )}
   {annotation.content.length > 150
    ? annotation.content.slice(0, 150) + '...'
    : annotation.content}
   </p>

   {annotation.note && (
   <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 italic line-clamp-1">
    {annotation.note.length > 80 ? annotation.note.slice(0, 80) + '...' : annotation.note}
   </p>
   )}

   <div className="flex items-center gap-1 mt-1 flex-wrap">
   {pageRef && (
    <span className="text-[9px] text-gray-500 dark:text-gray-400 bg-surface-1 px-1 py-0.5 rounded">
    {pageRef}
    </span>
   )}
   {(annotation.tags || []).slice(0, 3).map((tag) => (
    <span
    key={tag}
    className={`text-[9px] px-1 py-0.5 rounded ${TAG_COLORS[tag] || DEFAULT_TAG_COLOR}`}
    >
    {tag}
    </span>
   ))}
   </div>
  </div>
  </div>
 </button>
 );
});
