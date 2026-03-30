/**
 * InterventionService Unit Tests
 */

import { InterventionService } from '../../src/services/InterventionService';

describe('InterventionService', () => {
  const baseCtx = {
    userId: 'user-1',
    bookId: 'book-1',
    currentPage: 10,
    totalPages: 100,
    highlightCount: 0,
    sessionDuration: 300,
  };

  describe('detectConfusion', () => {
    it('should return null for normal reading', () => {
      expect(InterventionService.detectConfusion(baseCtx)).toBeNull();
    });

    it('should detect confusion from multiple re-reads', () => {
      const result = InterventionService.detectConfusion({ ...baseCtx, reReadCount: 3 });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('confusion_detected');
      expect(result!.priority).toBe('medium');
    });

    it('should detect high priority confusion with multiple signals', () => {
      const result = InterventionService.detectConfusion({
        ...baseCtx, reReadCount: 5, wordsPerMinute: 80, sessionDuration: 180,
      });
      expect(result).not.toBeNull();
      expect(result!.priority).toBe('high');
    });

    it('should detect confusion from long pause', () => {
      const result = InterventionService.detectConfusion({ ...baseCtx, timeOnPage: 400 });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('confusion_detected');
    });
  });

  describe('detectMilestone', () => {
    it('should detect book completion', () => {
      const result = InterventionService.detectMilestone({ ...baseCtx, currentPage: 100, totalPages: 100 });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('celebration');
      expect(result!.trigger).toBe('book_completed');
    });

    it('should detect halfway mark', () => {
      const result = InterventionService.detectMilestone({ ...baseCtx, currentPage: 50, totalPages: 100 });
      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('halfway_mark');
    });

    it('should detect reading start', () => {
      const result = InterventionService.detectMilestone({ ...baseCtx, currentPage: 1, sessionDuration: 30 });
      expect(result).not.toBeNull();
      expect(result!.trigger).toBe('reading_started');
    });

    it('should return null for normal progress', () => {
      const result = InterventionService.detectMilestone({ ...baseCtx, currentPage: 30, totalPages: 100 });
      expect(result).toBeNull();
    });
  });

  describe('analyzePace', () => {
    it('should return null for short sessions', () => {
      expect(InterventionService.analyzePace(baseCtx)).toBeNull();
    });

    it('should suggest deeper engagement for fast readers', () => {
      const result = InterventionService.analyzePace({
        ...baseCtx, currentPage: 50, sessionDuration: 900, highlightCount: 0,
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('pace_coaching');
    });

    it('should suggest break for slow long sessions', () => {
      const result = InterventionService.analyzePace({
        ...baseCtx, currentPage: 5, sessionDuration: 2400,
      });
      expect(result).not.toBeNull();
      expect(result!.type).toBe('break_suggestion');
    });
  });
});
