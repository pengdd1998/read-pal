'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';
import { OutlineChapterGroup } from './OutlineChapterGroup';

interface OutlinePanelProps {
 annotations: Annotation[];
 bookTitle?: string;
 onScrollToAnnotation: (annotation: Annotation) => void;
}

interface ChapterGroup {
 chapterIndex: number;
 label: string;
 highlights: Annotation[];
 notes: Annotation[];
 bookmarks: Annotation[];
}

const TYPE_ICONS: Record<string, string> = {
 highlight: '\u{1F58D}',
 note: '\u{1F4DD}',
 bookmark: '\u{1F516}',
};

export const OutlinePanel = React.memo(function OutlinePanel({
 annotations,
 onScrollToAnnotation,
}: OutlinePanelProps) {
 const t = useTranslations('reader');
 const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
 const [searchQuery, setSearchQuery] = useState('');
 const [filterType, setFilterType] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all');

 const stableScrollTo = useCallback((a: Annotation) => { onScrollToAnnotation(a); }, [onScrollToAnnotation]);

 const chapters = useMemo(() => {
 const filtered = annotations.filter((a) => {
  if (filterType !== 'all' && a.type !== filterType) return false;
  if (!searchQuery.trim()) return true;
  const q = searchQuery.toLowerCase();
  return (
  (a.content || '').toLowerCase().includes(q) ||
  (a.note || '').toLowerCase().includes(q) ||
  (a.tags || []).some((tag) => tag.toLowerCase().includes(q))
  );
 });

 const chapterMap = new Map<number, Annotation[]>();
 const ungrouped: Annotation[] = [];

 for (const a of filtered) {
  const loc = a.location as unknown as Record<string, unknown> | undefined;
  const ch = loc?.chapterIndex;
  if (typeof ch === 'number' && ch >= 0) {
  const list = chapterMap.get(ch) || [];
  list.push(a);
  chapterMap.set(ch, list);
  } else {
  ungrouped.push(a);
  }
 }

 const groups: ChapterGroup[] = [...chapterMap.entries()]
  .sort(([a], [b]) => a - b)
  .map(([idx, items]) => ({
  chapterIndex: idx,
  label: t('outline_chapter', { number: idx + 1 }),
  highlights: items.filter((a) => a.type === 'highlight'),
  notes: items.filter((a) => a.type === 'note'),
  bookmarks: items.filter((a) => a.type === 'bookmark'),
  }));

 if (ungrouped.length > 0) {
  groups.push({
  chapterIndex: -1,
  label: t('outline_other'),
  highlights: ungrouped.filter((a) => a.type === 'highlight'),
  notes: ungrouped.filter((a) => a.type === 'note'),
  bookmarks: ungrouped.filter((a) => a.type === 'bookmark'),
  });
 }

 return groups;
 }, [annotations, filterType, searchQuery, t]);

 const toggleChapter = useCallback((chapterIndex: number) => {
 setExpandedChapters((prev) => {
  const next = new Set(prev);
  if (next.has(chapterIndex)) next.delete(chapterIndex);
  else next.add(chapterIndex);
  return next;
 });
 }, []);

 const expandAll = useCallback(() => {
 setExpandedChapters(new Set(chapters.map((c) => c.chapterIndex)));
 }, [chapters]);

 const collapseAll = useCallback(() => {
 setExpandedChapters(new Set());
 }, []);

 const totalHighlights = useMemo(() => annotations.filter((a) => a.type === 'highlight').length, [annotations]);
 const totalNotes = useMemo(() => annotations.filter((a) => a.type === 'note').length, [annotations]);
 const totalBookmarks = useMemo(() => annotations.filter((a) => a.type === 'bookmark').length, [annotations]);

 if (annotations.length === 0) {
 return (
  <div className="text-center py-12 px-4">
  <div className="text-4xl opacity-30 mb-3">{'\u{1F4D1}'}</div>
  <p className="text-sm text-gray-500 dark:text-gray-400">{t('outline_empty')}</p>
  </div>
 );
 }

 return (
 <div className="flex flex-col h-full">
  {/* Header */}
  <div className="px-4 py-3 border-b border-surface-3">
  <div className="flex items-center justify-between mb-2">
   <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">
   {t('outline_title')}
   </h3>
   <div className="flex gap-1">
   <button
    onClick={expandAll}
    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    {t('outline_expand_all')}
   </button>
   <button
    onClick={collapseAll}
    className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
   >
    {t('outline_collapse_all')}
   </button>
   </div>
  </div>

  <input
   type="text"
   value={searchQuery}
   onChange={(e) => setSearchQuery(e.target.value)}
   placeholder={t('outline_search_placeholder')}
   aria-label={t('outline_search_placeholder')}
   className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-surface-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all mb-2"
  />

  <div className="flex gap-1">
   {[
   { key: 'all' as const, label: t('outline_all', { count: annotations.length }), ariaLabel: t('outline_all', { count: annotations.length }) },
   { key: 'highlight' as const, label: `${TYPE_ICONS.highlight} ${totalHighlights}`, ariaLabel: t('outline_filter_highlights', { count: totalHighlights }) },
   { key: 'note' as const, label: `${TYPE_ICONS.note} ${totalNotes}`, ariaLabel: t('outline_filter_notes', { count: totalNotes }) },
   { key: 'bookmark' as const, label: `${TYPE_ICONS.bookmark} ${totalBookmarks}`, ariaLabel: t('outline_filter_bookmarks', { count: totalBookmarks }) },
   ].map((opt) => (
   <button
    key={opt.key}
    onClick={() => setFilterType(opt.key)}
    aria-label={opt.ariaLabel}
    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
    filterType === opt.key
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
  <div className="flex-1 overflow-y-auto">
  {chapters.length === 0 ? (
   <div className="text-center py-8">
   <p className="text-xs text-gray-500 dark:text-gray-400">{t('outline_no_match')}</p>
   </div>
  ) : (
   <div className="divide-y divide-gray-100 dark:divide-gray-800">
   {chapters.map((chapter) => (
    <OutlineChapterGroup
    key={chapter.chapterIndex}
    chapter={chapter}
    isExpanded={expandedChapters.has(chapter.chapterIndex)}
    onToggle={toggleChapter}
    onScrollToAnnotation={stableScrollTo}
    noItemsLabel={t('outline_no_items')}
    />
   ))}
   </div>
  )}
  </div>
 </div>
 );
});
