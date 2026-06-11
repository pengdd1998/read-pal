'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [mastery, setMastery] = useState<MasteryReport | null>(null);
  const currentChapterRef = useRef(-1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const loadChapterStudy = useCallback(async (
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
  ) => {
    if (!enabled || chapterIndex === currentChapterRef.current) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    try {
      // Generate objectives
      const objRes = await api.post<ChapterObjective[]>('/api/study-mode/objectives', {
        bookId,
        chapterIndex,
        chapterTitle,
        chapterContent,
      });

      const rawObj = (objRes.success && objRes.data) ? objRes.data : {};
      if (reqId !== reqIdRef.current) return;
      const newObjectives: ChapterObjective[] = Array.isArray(rawObj)
        ? rawObj
        : ((rawObj as Record<string, unknown>).objectives as ChapterObjective[]) ?? [];
      if (!mountedRef.current) return;
      setObjectives(newObjectives);

      // Generate concept checks
      const checkRes = await api.post<ConceptCheck[]>('/api/study-mode/concept-checks', {
        bookId,
        chapterIndex,
        chapterTitle,
        chapterContent,
        objectives: newObjectives.map((o) => o.text),
      });

      const rawChecks = (checkRes.success && checkRes.data) ? checkRes.data : {};
      if (reqId !== reqIdRef.current) return;
      if (!mountedRef.current) return;
      setChecks(Array.isArray(rawChecks) ? rawChecks : ((rawChecks as Record<string, unknown>).checks as ConceptCheck[]) ?? []);
      setRevealedAnswers(new Set());
      // Mark chapter loaded only after both calls succeed
      currentChapterRef.current = chapterIndex;
    } catch (err) {
      console.warn('useStudyMode: loadChapterStudy failed', err);
      if (mountedRef.current) setError('Failed to load study data');
    } finally {
      if (mountedRef.current) setLoading(false);
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
    setSaveStatus('saving');
    try {
      await api.post('/api/study-mode/save-checks', {
        bookId,
        checks: checksToSave,
      });
      setSaveStatus('saved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.warn('useStudyMode: saveChecks failed', err);
      setSaveStatus('failed');
    }
  }, [bookId]);

  const loadMastery = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<MasteryReport>(`/api/study-mode/mastery/${bookId}`);
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        setMastery(res.data);
      }
    } catch (err) {
      console.warn('useStudyMode: loadMastery failed', err);
      setError('Failed to load mastery report');
    }
  }, [bookId]);

  const toggleStudyMode = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        // Disabling — reset chapter ref so next enable gets fresh data
        currentChapterRef.current = -1;
      }
      return !prev;
    });
  }, []);

  return {
    enabled,
    objectives,
    checks,
    revealedAnswers,
    loading,
    error,
    saveStatus,
    mastery,
    toggleStudyMode,
    loadChapterStudy,
    toggleObjective,
    revealAnswer,
    saveChecks,
    loadMastery,
  };
}
