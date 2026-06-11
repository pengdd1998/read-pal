'use client';

import React, { useState, useMemo } from 'react';
import type {
 AnnotationItem,
 AnnotationStats,
 OutlineChapter,
} from '@/types/book';

interface NotesOutlineProps {
 allAnnotations: AnnotationItem[];
 annotationStats: AnnotationStats;
 t: (key: string, params?: Record<string, string | number>) => string;
}

interface AnnotationRowProps {
 ann: AnnotationItem;
 type: 'note' | 'highlight' | 'bookmark';
 bookmarkLabel: string;
}

const AnnotationRow = React.memo(function AnnotationRow({ ann, type, bookmarkLabel }: AnnotationRowProps) {
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

interface OutlineChapterRowProps {
 chapter: OutlineChapter;
 isExpanded: boolean;
 onToggle: () => void;
 noteCountLabel: string;
 noteCountPluralLabel: string;
 bookmarkLabel: string;
 noMatchingLabel: string;
}

const OutlineChapterRow = React.memo(function OutlineChapterRow({
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
   <button
    onClick={onToggle}
    className="w-full flex items-center gap-2 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors text-left focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    <svg aria-hidden="true"
     className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
     fill="none"
     viewBox="0 0 24 24"
     stroke="currentColor"
     strokeWidth={2}
    >
     <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 5l7 7-7 7"
     />
    </svg>
    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
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
      <p className="text-[10px] text-gray-500 dark:text-gray-400 px-7 py-1">{noMatchingLabel}</p>
     )}
    </div>
   )}
  </div>
 );
});

export const NotesOutline = React.memo(function NotesOutline({
 allAnnotations,
 annotationStats,
 t,
}: NotesOutlineProps) {
 const [outlineExpanded, setOutlineExpanded] = useState<Set<number>>(
 new Set(),
 );
 const [outlineFilter, setOutlineFilter] = useState<
 'all' | 'highlight' | 'note' | 'bookmark'
 >('all');

 const outlineChapters: OutlineChapter[] = useMemo(() => {
 const filtered = allAnnotations.filter((a) => {
  if (outlineFilter !== 'all' && a.type !== outlineFilter) return false;
  return true;
 });
 const chapterMap = new Map<number, AnnotationItem[]>();
 const ungrouped: AnnotationItem[] = [];
 for (const a of filtered) {
  const ch = a.location?.chapterIndex;
  if (typeof ch === 'number' && ch >= 0) {
  const list = chapterMap.get(ch) || [];
  list.push(a);
  chapterMap.set(ch, list);
  } else {
  ungrouped.push(a);
  }
 }
 const groups = [...chapterMap.entries()]
  .sort(([a], [b]) => a - b)
  .map(([idx, items]) => ({
  chapterIndex: idx,
  label: t('chapter', { number: idx + 1 }),
  highlights: items.filter((a) => a.type === 'highlight'),
  notes: items.filter((a) => a.type === 'note'),
  bookmarks: items.filter((a) => a.type === 'bookmark'),
  }));
 if (ungrouped.length > 0) {
  groups.push({
  chapterIndex: -1,
  label: t('other'),
  highlights: ungrouped.filter((a) => a.type === 'highlight'),
  notes: ungrouped.filter((a) => a.type === 'note'),
  bookmarks: ungrouped.filter((a) => a.type === 'bookmark'),
  });
 }
 return groups;
 }, [allAnnotations, outlineFilter, t]);

 if (allAnnotations.length === 0) {
 return (
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5 mb-6 animate-slide-up stagger-3 text-center">
  <p className="text-gray-500 dark:text-gray-400 text-sm">{t('noAnnotationsYet')}</p>
  <p className="text-gray-500 dark:text-gray-400 text-xs mt-1">{t('startReadingHint')}</p>
  </div>
 );
 }

 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 mb-6 animate-slide-up stagger-3 overflow-hidden">
  <div className="px-5 py-4 border-b border-surface-2">
  <div className="flex items-center justify-between mb-3">
   <div>
   <h2 className="font-semibold">{t('notesOutline')}</h2>
   <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
    {outlineChapters.length === 1
    ? t('annotationsAcrossChapters', {
     count: allAnnotations.length,
     chapters: outlineChapters.length,
     })
    : t('annotationsAcrossChaptersPlural', {
     count: allAnnotations.length,
     chapters: outlineChapters.length,
     })}
   </p>
   </div>
   <div className="flex gap-1">
   <button
    onClick={() =>
    setOutlineExpanded(
     new Set(outlineChapters.map((c) => c.chapterIndex)),
    )
    }
    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    {t('expandAll')}
   </button>
   <button
    onClick={() => setOutlineExpanded(new Set())}
    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    {t('collapseAll')}
   </button>
   </div>
  </div>
  {/* Type filter */}
  <div className="flex gap-1">
   {[
   { key: 'all' as const, label: t('all', { count: allAnnotations.length }) },
   {
    key: 'highlight' as const,
    label: `\u{1F58D} ${annotationStats.highlights}`,
   },
   {
    key: 'note' as const,
    label: `\u{1F4DD} ${annotationStats.notes}`,
   },
   {
    key: 'bookmark' as const,
    label: `\u{1F516} ${annotationStats.bookmarks}`,
   },
   ].map((opt) => (
   <button
    key={opt.key}
    onClick={() => setOutlineFilter(opt.key)}
    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
    outlineFilter === opt.key
     ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
     : 'bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-surface-2'
    }`}
   >
    {opt.label}
   </button>
   ))}
  </div>
  </div>
  {/* Chapter tree */}
  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
  {outlineChapters.map((chapter) => (
   <OutlineChapterRow
    key={chapter.chapterIndex}
    chapter={chapter}
    isExpanded={outlineExpanded.has(chapter.chapterIndex)}
    onToggle={() => {
     setOutlineExpanded((prev) => {
     const next = new Set(prev);
     if (next.has(chapter.chapterIndex))
      next.delete(chapter.chapterIndex);
     else next.add(chapter.chapterIndex);
     return next;
     });
    }}
    noteCountLabel={t('noteCount', { count: chapter.notes.length })}
    noteCountPluralLabel={t('noteCountPlural', { count: chapter.notes.length })}
    bookmarkLabel={t('bookmark')}
    noMatchingLabel={t('noMatchingItems')}
   />
  ))}
  </div>
 </div>
 );
});
