import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// useAnnotationFilters — the annotation sidebar's filter engine
// (M3.3 reading-layer test coverage). Props-in/result-out memo hook; the
// tab/tag/search STATE lives in AnnotationsSidebar, this tests the
// filtering semantics those states feed.
// ---------------------------------------------------------------------------

import { useAnnotationFilters } from '../annotations/useAnnotationFilters';
import type { Annotation } from '@read-pal/shared';

const ann = (over: Partial<Annotation>): Annotation => ({
  id: 'a1',
  type: 'highlight',
  content: '正文内容',
  note: null,
  tags: [],
  createdAt: '2026-09-16T00:00:00Z',
  ...over,
} as Annotation);

const anns = [
  ann({ id: 'h1', type: 'highlight', content: '能创造善良', tags: ['哲学'] }),
  ann({ id: 'n1', type: 'note', content: '划线文本', note: '我的笔记内容', tags: ['哲学', '科幻'] }),
  ann({ id: 'b1', type: 'bookmark', content: '' }),
];

function filters(over: Partial<Parameters<typeof useAnnotationFilters>[0]> = {}) {
  const { result } = renderHook(() =>
    useAnnotationFilters({ annotations: anns, activeTab: 'all', searchQuery: '', selectedTags: [], ...over }),
  );
  return result.current;
}

describe('useAnnotationFilters', () => {
  it('counts per tab and totals', () => {
    const f = filters();
    expect(f.counts).toEqual({ all: 3, highlight: 1, note: 1, bookmark: 1 });
  });

  it('tab filter keeps only that type', () => {
    expect(filters({ activeTab: 'note' }).filtered.map((a) => a.id)).toEqual(['n1']);
    expect(filters({ activeTab: 'all' }).filtered).toHaveLength(3);
  });

  it('search matches content, note, and tags (case-insensitive)', () => {
    expect(filters({ searchQuery: '笔记' }).filtered.map((a) => a.id)).toEqual(['n1']);
    expect(filters({ searchQuery: '科幻' }).filtered.map((a) => a.id)).toEqual(['n1']);
    expect(filters({ searchQuery: '善良' }).filtered.map((a) => a.id)).toEqual(['h1']);
    expect(filters({ searchQuery: 'nomatch' }).filtered).toEqual([]);
  });

  it('tag filter is OR semantics across selected tags', () => {
    expect(filters({ selectedTags: ['哲学'] }).filtered).toHaveLength(2);
    expect(filters({ selectedTags: ['哲学', '科幻'] }).filtered).toHaveLength(2);
    expect(filters({ selectedTags: ['none'] }).filtered).toEqual([]);
  });

  it('tag counts rank by frequency', () => {
    const f = filters();
    expect(f.uniqueTags[0]).toBe('哲学');
    expect(f.tagCounts['科幻']).toBe(1);
  });
});
