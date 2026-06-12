'use client';

import React, { useState, useMemo } from 'react';
import type {
 AnnotationItem,
 AnnotationStats,
 OutlineChapter,
} from '@/types/book';
import { OutlineChapterRow } from './OutlineChapterRow';

// --- OutlineFilterBar ---

type FilterKey = 'all' | 'highlight' | 'note' | 'bookmark';

interface OutlineFilterBarProps {
 annotationStats: AnnotationStats;
 totalAnnotations: number;
 activeFilter: FilterKey;
 onFilterChange: (key: FilterKey) => void;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const OutlineFilterBar = React.memo(function OutlineFilterBar({
 annotationStats,
 totalAnnotations,
 activeFilter,
 onFilterChange,
 t,
}: OutlineFilterBarProps) {
 const filterOptions: { key: FilterKey; label: string }[] = [
  { key: 'all', label: t('all', { count: totalAnnotations }) },
  { key: 'highlight', label: `\u{1F58D} ${annotationStats.highlights}` },
  { key: 'note', label: `\u{1F4DD} ${annotationStats.notes}` },
  { key: 'bookmark', label: `\u{1F516} ${annotationStats.bookmarks}` },
 ];

 return (
  <div className="flex gap-1">
   {filterOptions.map((opt) => (
    <button type="button"
     key={opt.key}
     onClick={() => onFilterChange(opt.key)}
     className={`px-2 py-1 rounded text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
      activeFilter === opt.key
       ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
       : 'bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-surface-2'
     }`}
    >
     {opt.label}
    </button>
   ))}
  </div>
 );
});

// --- NotesOutlineHeader ---

interface NotesOutlineHeaderProps {
 outlineChapters: OutlineChapter[];
 totalAnnotations: number;
 onExpandAll: () => void;
 onCollapseAll: () => void;
 annotationStats: AnnotationStats;
 outlineFilter: FilterKey;
 onFilterChange: (key: FilterKey) => void;
 t: (key: string, params?: Record<string, string | number>) => string;
}

const NotesOutlineHeader = React.memo(function NotesOutlineHeader({
 outlineChapters,
 totalAnnotations,
 onExpandAll,
 onCollapseAll,
 annotationStats,
 outlineFilter,
 onFilterChange,
 t,
}: NotesOutlineHeaderProps) {
 const subtitleKey = outlineChapters.length === 1
  ? 'annotationsAcrossChapters'
  : 'annotationsAcrossChaptersPlural';

 return (
  <div className="px-5 py-4 border-b border-surface-2">
   <div className="flex items-center justify-between mb-3">
    <div>
     <h2 className="font-semibold">{t('notesOutline')}</h2>
     <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
      {t(subtitleKey, { count: totalAnnotations, chapters: outlineChapters.length })}
     </p>
    </div>
    <div className="flex gap-1">
     <button type="button"
      onClick={onExpandAll}
      className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
     >
      {t('expandAll')}
     </button>
     <button type="button"
      onClick={onCollapseAll}
      className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-surface-1 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
     >
      {t('collapseAll')}
     </button>
    </div>
   </div>
   <OutlineFilterBar
    annotationStats={annotationStats}
    totalAnnotations={totalAnnotations}
    activeFilter={outlineFilter}
    onFilterChange={onFilterChange}
    t={t}
   />
  </div>
 );
});

// --- NotesOutline (main) ---

interface NotesOutlineProps {
 allAnnotations: AnnotationItem[];
 annotationStats: AnnotationStats;
 t: (key: string, params?: Record<string, string | number>) => string;
}

export const NotesOutline = React.memo(function NotesOutline({
 allAnnotations,
 annotationStats,
 t,
}: NotesOutlineProps) {
 const [outlineExpanded, setOutlineExpanded] = useState<Set<number>>(new Set());
 const [outlineFilter, setOutlineFilter] = useState<FilterKey>('all');

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
   <NotesOutlineHeader
    outlineChapters={outlineChapters}
    totalAnnotations={allAnnotations.length}
    onExpandAll={() => setOutlineExpanded(new Set(outlineChapters.map((c) => c.chapterIndex)))}
    onCollapseAll={() => setOutlineExpanded(new Set())}
    annotationStats={annotationStats}
    outlineFilter={outlineFilter}
    onFilterChange={setOutlineFilter}
    t={t}
   />
   <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
    {outlineChapters.map((chapter) => (
     <OutlineChapterRow
      key={chapter.chapterIndex}
      chapter={chapter}
      isExpanded={outlineExpanded.has(chapter.chapterIndex)}
      onToggle={() => {
       setOutlineExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(chapter.chapterIndex)) next.delete(chapter.chapterIndex);
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
