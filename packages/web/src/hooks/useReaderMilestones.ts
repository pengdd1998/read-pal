'use client';

import { useEffect, useRef } from 'react';
import type { Book } from '@read-pal/shared';
import { safeSetItem, safeRemoveItem } from '@/lib/safe-storage';
import { warn } from '@/lib/logger';

interface UseReaderMilestonesOptions {
  loading: boolean;
  chaptersLength: number;
  currentChapter: number;
  book: Book | null;
  setShowCompletion: (v: boolean) => void;
  setMilestone: (v: string | null) => void;
}

/**
 * Detects book completion (last chapter + 95% progress) and
 * reading milestones (25%, 50%, 75%) to show toast notifications.
 */
export function useReaderMilestones({
  loading,
  chaptersLength,
  currentChapter,
  book,
  setShowCompletion,
  setMilestone,
}: UseReaderMilestonesOptions) {
  // Book completion detection
  useEffect(() => {
    if (!loading && chaptersLength > 1 && currentChapter === chaptersLength - 1 && (book?.progress ?? 0) >= 0.95) {
      try {
        safeSetItem('read-pal-tour-complete', 'true');
        safeRemoveItem('read-pal-tour-step');
      } catch (err) { warn('useReaderMilestones: localStorage write failed', err); }
      const timer = setTimeout(() => setShowCompletion(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentChapter, chaptersLength, loading, book?.progress, setShowCompletion]);

  // Clear milestones when book changes
  const shownMilestones = useRef<Set<number>>(new Set());
  useEffect(() => {
    shownMilestones.current.clear();
  }, [book?.id]);
  useEffect(() => {
    if (loading || chaptersLength === 0) return;
    const pct = ((currentChapter + 1) / chaptersLength) * 100;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let highestMilestone: number | null = null;
    for (const m of [25, 50, 75]) {
      if (pct >= m && !shownMilestones.current.has(m)) {
        shownMilestones.current.add(m);
        highestMilestone = m;
        timers.push(setTimeout(() => setMilestone(null), 3000));
      }
    }
    if (highestMilestone !== null) {
      setMilestone(`${highestMilestone}%`);
    }
    // Clear any in-flight timeout AND the visible toast on re-run so a
    // user who navigates backward before the 3s timer fires doesn't
    // see the milestone toast stuck on screen. The next render's body
    // re-sets the toast if a new milestone is hit; otherwise it stays
    // cleared. Without this, navigating back from chapter 25% → 0%
    // would clear the timer but never call setMilestone(null).
    return () => {
      timers.forEach(clearTimeout);
      setMilestone(null);
    };
  }, [currentChapter, chaptersLength, loading, setMilestone]);
}
