import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from '../usePageTitle';

describe('usePageTitle', () => {
  const originalTitle = document.title;

  afterEach(() => {
    document.title = originalTitle;
  });

  it('sets document title with read-pal suffix', () => {
    renderHook(() => usePageTitle('Knowledge Graph'));
    expect(document.title).toBe('Knowledge Graph | read-pal');
  });

  it('uses plain "read-pal" when title is empty', () => {
    renderHook(() => usePageTitle(''));
    expect(document.title).toBe('read-pal');
  });

  it('restores previous title on unmount', () => {
    document.title = 'Library | read-pal';
    const { unmount } = renderHook(() => usePageTitle('Settings'));
    expect(document.title).toBe('Settings | read-pal');
    unmount();
    expect(document.title).toBe('Library | read-pal');
  });

  it('updates title when title prop changes', () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => usePageTitle(title),
      { initialProps: { title: 'Page A' } },
    );
    expect(document.title).toBe('Page A | read-pal');

    rerender({ title: 'Page B' });
    expect(document.title).toBe('Page B | read-pal');
  });
});
