'use client';

import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface ChapterObjective {
  id: string;
  text: string;
  completed: boolean;
}

export interface ConceptCheck {
  id: string;
  question: string;
  hint: string;
  answer: string;
  position: 'start' | 'middle' | 'end';
}

export interface MasteryReport {
  bookId: string;
  chaptersCompleted: number;
  totalChapters: number;
  overallMastery: number;
  weakAreas: string[];
  strongAreas: string[];
  cardsDue: number;
}

export function useStudyMode(bookId: string) {
  const [enabled, setEnabled] = useState(false);
  const [objectives, setObjectives] = useState<ChapterObjective[]>([]);
  const [checks, setChecks] = useState<ConceptCheck[]>([]);
  const [revealedAnswers, setRevealedAnswers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [mastery, setMastery] = useState<MasteryReport | null>(null);
  const currentChapterRef = useRef(-1);

  const loadChapterStudy = useCallback(async (
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
  ) => {
    if (!enabled || chapterIndex === currentChapterRef.current) return;
    currentChapterRef.current = chapterIndex;
    setLoading(true);

    try {
      // Generate objectives
      const objRes = await api.post<ChapterObjective[]>('/api/study-mode/objectives', {
        bookId,
        chapterIndex,
        chapterTitle,
      });

      const newObjectives = (objRes.success && objRes.data) ? objRes.data : [];
      setObjectives(newObjectives);

      // Generate concept checks
      const checkRes = await api.post<ConceptCheck[]>('/api/study-mode/concept-checks', {
        bookId,
        chapterIndex,
        chapterTitle,
        chapterContent,
        objectives: newObjectives.map((o) => o.text),
      });

      setChecks((checkRes.success && checkRes.data) ? checkRes.data : []);
      setRevealedAnswers(new Set());
    } catch (err) {
      console.warn('Failed to load study mode data:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled, bookId]);

  const toggleObjective = useCallback((id: string) => {
    setObjectives((prev) =>
      prev.map((o) => o.id === id ? { ...o, completed: !o.completed } : o),
    );
  }, []);

  const revealAnswer = useCallback((id: string) => {
    setRevealedAnswers((prev) => new Set(prev).add(id));
  }, []);

  const saveChecks = useCallback(async (checksToSave: ConceptCheck[]) => {
    try {
      await api.post('/api/study-mode/save-checks', {
        bookId,
        checks: checksToSave,
      });
    } catch (err) {
      console.warn('Failed to save checks:', err);
    }
  }, [bookId]);

  const loadMastery = useCallback(async () => {
    try {
      const res = await api.get<MasteryReport>(`/api/study-mode/mastery/${bookId}`);
      if (res.success && res.data) {
        setMastery(res.data);
      }
    } catch (err) {
      console.warn('Failed to load mastery:', err);
    }
  }, [bookId]);

  const toggleStudyMode = useCallback(() => {
    setEnabled((prev) => !prev);
    if (!enabled) {
      // Reset on disable
      currentChapterRef.current = -1;
    }
  }, [enabled]);

  return {
    enabled,
    objectives,
    checks,
    revealedAnswers,
    loading,
    mastery,
    toggleStudyMode,
    loadChapterStudy,
    toggleObjective,
    revealAnswer,
    saveChecks,
    loadMastery,
  };
}
