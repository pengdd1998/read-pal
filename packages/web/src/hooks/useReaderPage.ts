'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useAnnotationHighlights } from '@/hooks/useAnnotationHighlights';
import { useReaderSettings } from '@/hooks/useReaderSettings';
import { useReadingSession } from '@/hooks/useReadingSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useStudyMode } from '@/hooks/useStudyMode';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBookContent } from '@/hooks/useBookContent';
import { useAnnotationActions } from '@/hooks/useAnnotationActions';
import { useReaderUI, type ReaderUIState } from '@/hooks/useReaderUI';
export type { ReaderUIState };
import { isCapacitor } from '@/lib/capacitor';
import { getAuthToken } from '@/lib/auth-fetch';
import { api } from '@/lib/api';
import { detectGenre, type BookGenre } from '@/lib/companion-prompts';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';

/**
 * Orchestrator hook for the reading page.
 *
 * Composes all the individual reading hooks into a single return value
 * so the page component only handles rendering.
 */
export function useReaderPage() {
  const t = useTranslations('reader');
  usePageTitle(t('page_title'));
  const params = useParams();
  const router = useRouter();
  const bookId = (params?.bookId ?? '') as string;
  const { toast } = useToast();

  // --- Core data ---
  const {
    book, chapters, currentChapter, annotations, loading, error,
    chapterContent, chapterTitle, setCurrentChapter, setAnnotations,
    setChapterFade, chapterFade,
    currentSegment, totalSegments, pageContent, setCurrentSegment, segments,
  } = useBookContent(bookId, t('failed_load_book'), t('failed_load_book'), t('failed_connect'));

  const ui = useReaderUI();
  const contentRef = useRef<HTMLElement | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const chatHandleRef = useRef<CompanionChatHandle | null>(null);

  // Poll until content container is mounted
  useEffect(() => {
    setContentReady(false);
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += 100;
      if (contentRef.current) {
        clearInterval(id);
        setContentReady(true);
      } else if (elapsed > 5000) {
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
  }, [chapterContent]);

  const selection = useTextSelection(contentRef);

  const { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight } = useReaderSettings(bookId, loading);
  const [chapterScrollProgress, setChapterScrollProgress] = useState(0);
  const { sessionIdRef } = useReadingSession({ bookId, loading, currentChapter, chaptersLength: chapters.length, isPaused: ui.isPaused, scrollProgress: chapterScrollProgress });
  const studyMode = useStudyMode(bookId);

  // --- Save progress on leave ---
  const currentChapterRef = useRef(currentChapter);
  const scrollProgressRef = useRef(chapterScrollProgress);
  const currentSegmentRef = useRef(currentSegment);
  useEffect(() => { currentChapterRef.current = currentChapter; }, [currentChapter]);
  useEffect(() => { scrollProgressRef.current = chapterScrollProgress; }, [chapterScrollProgress]);
  useEffect(() => { currentSegmentRef.current = currentSegment; }, [currentSegment]);

  useEffect(() => {
    if (loading || !bookId) return;
    return () => {
      const token = getAuthToken();
      const chapter = currentChapterRef.current;
      const scroll = scrollProgressRef.current;
      const segment = currentSegmentRef.current;
      try {
        fetch(`/api/books/${bookId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ current_page: chapter, scroll_progress: scroll, current_segment: segment }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    };
  }, [bookId, loading]);

  // --- Annotation actions ---
  const annotationActions = useAnnotationActions({
    bookId, currentChapter, chapters, contentRef, selectionRange: selection.range,
    selectionOffsets: selection.offsets,
    annotations, setAnnotations,
    toastError: (msg: string) => toast(msg, 'error'),
    toast: {
      failed_load_annotations: t('failed_load_annotations'),
      failed_save_highlight: t('failed_save_highlight'),
      failed_save_note: t('failed_save_note'),
      failed_remove_bookmark: t('failed_remove_bookmark'),
      failed_add_bookmark: t('failed_add_bookmark'),
      failed_delete_annotation: t('failed_delete_annotation'),
      failed_save_progress: t('failed_save_progress'),
    },
  });

  // --- Reading speed ---
  const [readingWpm, setReadingWpm] = useState<number | null>(null);
  useEffect(() => {
    if (loading) return;
    api.get<{ currentWpm: number; trend: string }>('/api/stats/reading-speed')
      .then((res) => { if (res.success && res.data && res.data.currentWpm > 0) setReadingWpm(res.data.currentWpm); });
  }, [loading]);

  // --- Selection tracking ---
  const [hasMadeSelection, setHasMadeSelection] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('read-pal-selection-used') === 'true';
  });
  const [highlightMode, setHighlightMode] = useState(false);
  const [bgEnabled, setBgEnabled] = useState(true);
  const [sessionSummary, setSessionSummary] = useState<{ duration: number; chaptersRead: number; sessionId?: string } | null>(null);

  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) {
      setHasMadeSelection(true);
      try { localStorage.setItem('read-pal-selection-used', 'true'); } catch { /* ignore */ }
    }
  }, [selection.isCollapsed, hasMadeSelection]);

  useEffect(() => {
    if (highlightMode && !selection.isCollapsed && selection.text) {
      annotationActions.handleAddHighlight(selection.text, 'amber');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMode, selection.isCollapsed]);

  // --- Chapter navigation ---
  const handleChapterChange = useCallback(async (chapterIndex: number) => {
    if (chapterIndex === currentChapter || chapterIndex < 0 || chapterIndex >= chapters.length) return;
    setChapterFade('out');
    await new Promise<void>((r) => setTimeout(r, 150));
    setCurrentChapter(chapterIndex);
    setChapterFade('in');
    try {
      await api.patch(`/api/books/${bookId}`, { current_page: chapterIndex, current_segment: 0 });
    } catch (err) {
      console.error('Failed to update progress:', err);
      toast(t('failed_save_progress'), 'error');
    }
  }, [currentChapter, chapters.length, bookId, setChapterFade, setCurrentChapter, toast, t]);

  // --- Keyboard shortcuts ---
  useKeyboardShortcuts({
    currentChapter, chaptersLength: chapters.length, sidebarOpen: ui.sidebarOpen,
    showShortcutsHelp: ui.showShortcutsHelp, showMobileSettings: ui.showMobileSettings,
    tocOpen: ui.tocOpen, synthesisOpen: ui.synthesisOpen,
    onChapterChange: handleChapterChange,
    onToggleBookmark: annotationActions.handleToggleBookmark,
    onSetHighlightMode: setHighlightMode,
    onSetTocOpen: ui.setTocOpen,
    onSetShowShortcutsHelp: ui.setShowShortcutsHelp,
    onSetSidebarOpen: ui.setSidebarOpen,
    onSetShowMobileSettings: ui.setShowMobileSettings,
    onSetSynthesisOpen: ui.setSynthesisOpen,
  });

  useAnnotationHighlights(contentRef, annotations, currentChapter, theme, contentReady);

  // --- Capacitor status bar sync ---
  useEffect(() => {
    if (!isCapacitor()) return;
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
      const colors: Record<string, string> = {
        light: '#fefdfb',
        dark: '#1a1410',
        sepia: '#f8f4ec',
      };
      StatusBar.setBackgroundColor({ color: colors[theme] || colors.light });
    }).catch(() => {});
  }, [theme]);

  // --- Study mode ---
  useEffect(() => {
    if (!loading && chapters.length > 0 && studyMode.enabled) {
      const ch = chapters[currentChapter];
      const content = ch?.rawContent || ch?.content || '';
      studyMode.loadChapterStudy(currentChapter, ch?.title || '', content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, loading, chapters.length, studyMode.enabled]);

  // --- Book completion detection ---
  useEffect(() => {
    if (!loading && chapters.length > 1 && currentChapter === chapters.length - 1 && (book?.progress ?? 0) >= 0.95) {
      try {
        localStorage.setItem('read-pal-tour-complete', 'true');
        localStorage.removeItem('read-pal-tour-step');
      } catch { /* ignore */ }
      const timer = setTimeout(() => ui.setShowCompletion(true), 3000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, chapters.length, loading, book?.progress]);

  // --- Milestone detection ---
  const shownMilestones = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (loading || chapters.length === 0) return;
    const pct = ((currentChapter + 1) / chapters.length) * 100;
    for (const m of [25, 50, 75]) {
      if (pct >= m && !shownMilestones.current.has(m)) {
        shownMilestones.current.add(m);
        ui.setMilestone(`${m}%`);
        const timer = setTimeout(() => ui.setMilestone(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, chapters.length, loading]);

  // --- Genre detection ---
  const bookGenre: BookGenre = detectGenre(
    (book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined,
    book?.title,
    (book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
  );
  const isFiction = bookGenre === 'fiction';

  const chapterTitles = useMemo(() => chapters.map((ch) => ({ title: ch.title })), [chapters]);

  // --- Back button ---
  const sessionStartRef = useRef<number>(Date.now());
  const handleBack = useCallback(() => {
    const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (elapsed > 30) {
      setSessionSummary({ duration: elapsed, chaptersRead: currentChapter + 1, sessionId: sessionIdRef.current || undefined });
    } else {
      router.push('/library');
    }
  }, [currentChapter, router, sessionIdRef]);

  // Settings panel handler — mobile uses sheet, desktop uses inline menu
  const handleShowSettings = useCallback(() => {
    if (window.innerWidth < 640) {
      ui.setShowMobileSettings(true);
    } else {
      ui.setShowSettingsMenu((v: boolean) => !v);
    }
  }, [ui]);

  const handleToggleStudyMode = useCallback(() => {
    if (!studyMode.enabled) ui.closeAllPanels();
    studyMode.toggleStudyMode();
  }, [studyMode, ui]);

  const handleBackToLibrary = useCallback(() => {
    setSessionSummary(null);
    router.push('/library');
  }, [router]);

  return {
    // Identity
    bookId,
    t,
    router,
    // Data
    book, chapters, currentChapter, annotations, loading, error,
    chapterContent, chapterTitle, chapterFade,
    currentSegment, totalSegments, pageContent, segments,
    // Refs
    contentRef, chatHandleRef,
    // Settings
    fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode,
    fontFamily, setFontFamily, lineHeight, setLineHeight,
    bgEnabled, setBgEnabled,
    highlightMode, setHighlightMode,
    readingWpm, hasMadeSelection, setHasMadeSelection,
    sessionSummary, setSessionSummary,
    sessionStartRef, sessionIdRef,
    chapterScrollProgress, setChapterScrollProgress,
    // Genre
    isFiction, bookGenre, chapterTitles,
    // Actions
    ui,
    handleChapterChange, handleBack, handleShowSettings, handleToggleStudyMode, handleBackToLibrary,
    setCurrentChapter, setCurrentSegment,
    annotationActions, selection,
    studyMode,
    contentReady,
  };
}
