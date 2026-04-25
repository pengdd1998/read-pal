'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, string> = {
  highlight: '\u{1F58D}',
  note: '\u{1F4DD}',
  bookmark: '\u{1F516}',
};

const TAG_COLORS: Record<string, string> = {
  discuss: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  important: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  question: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  key_idea: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  surprising: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

function defaultTagColor(tag: string): string {
  return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OutlinePanel({
  annotations,
  bookTitle,
  onScrollToAnnotation,
}: OutlinePanelProps) {
  const t = useTranslations('reader');
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'highlight' | 'note' | 'bookmark'>('all');

  // Group annotations by chapter
  const chapters = useMemo(() => {
    const filtered = annotations.filter((a) => {
      if (filterType !== 'all' && a.type !== filterType) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (a.content || '').toLowerCase().includes(q) ||
        (a.note || '').toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(q))
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

    // Add ungrouped annotations
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
  }, [annotations, filterType, searchQuery]);

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

  // Stats
  const totalHighlights = annotations.filter((a) => a.type === 'highlight').length;
  const totalNotes = annotations.filter((a) => a.type === 'note').length;
  const totalBookmarks = annotations.filter((a) => a.type === 'bookmark').length;

  if (annotations.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <div className="text-4xl opacity-30 mb-3">{'\u{1F4D1}'}</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('outline_empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">
            {t('outline_title')}
          </h3>
          <div className="flex gap-1">
            <button
              onClick={expandAll}
              className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('outline_expand_all')}
            </button>
            <button
              onClick={collapseAll}
              className="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('outline_collapse_all')}
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('outline_search_placeholder')}
          className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-amber-400/50 focus:border-amber-400 transition-all mb-2"
        />

        {/* Type filter */}
        <div className="flex gap-1">
          {[
            { key: 'all' as const, label: t('outline_all', { count: annotations.length }) },
            { key: 'highlight' as const, label: `${TYPE_ICONS.highlight} ${totalHighlights}` },
            { key: 'note' as const, label: `${TYPE_ICONS.note} ${totalNotes}` },
            { key: 'bookmark' as const, label: `${TYPE_ICONS.bookmark} ${totalBookmarks}` },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilterType(opt.key)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                filterType === opt.key
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
            <p className="text-xs text-gray-400">{t('outline_no_match')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {chapters.map((chapter) => {
              const isExpanded = expandedChapters.has(chapter.chapterIndex);
              const totalCount = chapter.highlights.length + chapter.notes.length + chapter.bookmarks.length;

              return (
                <div key={chapter.chapterIndex}>
                  {/* Chapter header */}
                  <button
                    onClick={() => toggleChapter(chapter.chapterIndex)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                  >
                    <svg
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
                          {chapter.notes.length} note{chapter.notes.length !== 1 ? 's' : ''}
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

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="pb-2">
                      {/* Notes first (section headers) */}
                      {chapter.notes.map((note) => (
                        <OutlineItem
                          key={note.id}
                          annotation={note}
                          onClick={() => onScrollToAnnotation(note)}
                        />
                      ))}

                      {/* Highlights */}
                      {chapter.highlights.map((highlight) => (
                        <OutlineItem
                          key={highlight.id}
                          annotation={highlight}
                          onClick={() => onScrollToAnnotation(highlight)}
                        />
                      ))}

                      {/* Bookmarks */}
                      {chapter.bookmarks.map((bookmark) => (
                        <OutlineItem
                          key={bookmark.id}
                          annotation={bookmark}
                          onClick={() => onScrollToAnnotation(bookmark)}
                        />
                      ))}

                      {totalCount === 0 && (
                        <p className="text-[10px] text-gray-400 px-8 py-1">{t('outline_no_items')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outline Item — individual annotation in the tree
// ---------------------------------------------------------------------------

function OutlineItem({
  annotation,
  onClick,
}: {
  annotation: Annotation;
  onClick: () => void;
}) {
  const loc = annotation.location as unknown as Record<string, unknown> | undefined;
  const pageRef = loc?.pageNumber ? `p. ${loc.pageNumber}` : '';

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-6 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <span className="text-[10px] mt-0.5 flex-shrink-0">
          {TYPE_ICONS[annotation.type] || '\u2022'}
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
                className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                style={{ backgroundColor: annotation.color }}
              />
            )}
            {annotation.content.length > 150
              ? annotation.content.slice(0, 150) + '...'
              : annotation.content}
          </p>

          {/* User note */}
          {annotation.note && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic line-clamp-1">
              {annotation.note.length > 80 ? annotation.note.slice(0, 80) + '...' : annotation.note}
            </p>
          )}

          {/* Tags and page ref */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {pageRef && (
              <span className="text-[9px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                {pageRef}
              </span>
            )}
            {(annotation.tags || []).slice(0, 3).map((tag) => (
              <span
                key={tag}
                className={`text-[9px] px-1 py-0.5 rounded ${TAG_COLORS[tag] || defaultTagColor(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
