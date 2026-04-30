import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock capacitor detection
vi.mock('@/lib/capacitor', () => ({
  isCapacitor: vi.fn(() => true),
}));

// Mock API client
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

import { isCapacitor } from '@/lib/capacitor';
import { cacheBook, getCachedContent, isCached, removeCachedBook, getCachedBookIds, getCachedChapter } from '@/lib/mobile-cache';
import { api } from '@/lib/api';

describe('mobile-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(true);
  });

  describe('when not in Capacitor', () => {
    beforeEach(() => {
      (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(false);
    });

    it('cacheBook returns {cached: 0, total: 0}', async () => {
      const result = await cacheBook('book-1');
      expect(result).toEqual({ cached: 0, total: 0 });
      expect(api.get).not.toHaveBeenCalled();
    });

    it('getCachedContent returns null', async () => {
      expect(await getCachedContent('book-1')).toBeNull();
    });

    it('isCached returns false', async () => {
      expect(await isCached('book-1')).toBe(false);
    });

    it('removeCachedBook returns false', async () => {
      expect(await removeCachedBook('book-1')).toBe(false);
    });

    it('getCachedBookIds returns empty array', async () => {
      expect(await getCachedBookIds()).toEqual([]);
    });

    it('getCachedChapter returns null', async () => {
      expect(await getCachedChapter('book-1', 0)).toBeNull();
    });
  });

  describe('when in Capacitor', () => {
    beforeEach(() => {
      (isCapacitor as ReturnType<typeof vi.fn>).mockReturnValue(true);
    });

    it('cacheBook calls API with correct URL', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        data: null,
      });

      await cacheBook('book-123');
      expect(api.get).toHaveBeenCalledWith('/api/upload/books/book-123/content');
    });

    it('cacheBook returns -1 on API failure', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        data: null,
      });

      const result = await cacheBook('book-1');
      expect(result.cached).toBe(-1);
      expect(result.total).toBe(0);
    });

    it('cacheBook returns -1 on API exception', async () => {
      (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));

      const result = await cacheBook('book-1');
      expect(result.cached).toBe(-1);
    });
  });
});
