import { useMemo, useCallback } from 'react';
import type { Annotation } from '@read-pal/shared';
import type { FilterTab } from './FilterTabs';

interface UseAnnotationFiltersOptions {
  annotations: Annotation[];
  activeTab: FilterTab;
  searchQuery: string;
  selectedTags: string[];
}

interface UseAnnotationFiltersResult {
  filtered: Annotation[];
  tagCounts: Record<string, number>;
  uniqueTags: string[];
  counts: Record<FilterTab, number>;
}

export function useAnnotationFilters({
  annotations,
  activeTab,
  searchQuery,
  selectedTags,
}: UseAnnotationFiltersOptions): UseAnnotationFiltersResult {
  const tagCounts = useMemo((): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const a of annotations) {
      for (const tag of a.tags || []) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }, [annotations]);

  const uniqueTags = useMemo(
    () => Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name),
    [tagCounts],
  );

  const counts = useMemo((): Record<FilterTab, number> => {
    const c: Record<FilterTab, number> = { all: 0, highlight: 0, note: 0, bookmark: 0 };
    for (const a of annotations) {
      c.all++;
      if (a.type === 'highlight' || a.type === 'note' || a.type === 'bookmark') {
        c[a.type as FilterTab]++;
      }
    }
    return c;
  }, [annotations]);

  const filtered = useMemo(() => {
    return (activeTab === 'all'
      ? annotations
      : annotations.filter((a) => a.type === activeTab)
    ).filter((a) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (a.content || '').toLowerCase().includes(q) ||
        (a.note || '').toLowerCase().includes(q) ||
        (a.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }).filter((a) => {
      if (selectedTags.length === 0) return true;
      return selectedTags.some((tag) => (a.tags || []).includes(tag));
    });
  }, [annotations, activeTab, searchQuery, selectedTags]);

  return { filtered, tagCounts, uniqueTags, counts };
}

export function useBulkSelection(filtered: Annotation[]) {
  const toggleSelect = useCallback((id: string, prev: Set<string>): Set<string> => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }, []);

  const selectAll = useCallback((): Set<string> => {
    return new Set(filtered.map((a) => a.id));
  }, [filtered]);

  const deselectAll = useCallback((): Set<string> => {
    return new Set();
  }, []);

  return { toggleSelect, selectAll, deselectAll };
}
