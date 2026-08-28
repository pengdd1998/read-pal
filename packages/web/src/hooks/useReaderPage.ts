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
import { useReaderProgress } from '@/hooks/useReaderProgress';
import { useReaderMilestones } from '@/hooks/useReaderMilestones';
import { useReaderSelectionState } from '@/hooks/useReaderSelectionState';
import { useReaderActions } from '@/hooks/useReaderActions';
import { useStatusBar } from '@/hooks/useStatusBar';
import { api } from '@/lib/api';
import { detectGenre, type BookGenre } from '@/lib/companion-prompts';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import { warn } from '@/lib/logger';

const STATUS_BAR_COLORS: Record<string, string> = {
  light: '#fefdfb',
  dark: '#1a1410',
  sepia: '#f8f4ec',
};

/**
 * Orchestrator hook for the reading page.
 *
 * Composes all the individual reading hooks into a single return value
 * so the page component only handles rendering.
 */
export function useReaderPage() {
  const t = useTranslations('reader');
  const tRef = useRef(t);
  tRef.current = t;
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
  } = useBookContent(bookId, t('failed_load_book'), t('failed_connect'));

  const ui = useReaderUI();
  const contentRef = useRef<HTMLElement | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const chatHandleRef = useRef<CompanionChatHandle | null>(null);

  // Poll until content container is mounted and has content
  useEffect(() => {
    setContentReady(false);
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += 100;
      const el = contentRef.current;
      if (el && el.innerHTML.length > 0) {
        clearInterval(id);
        setContentReady(true);
      } else if (elapsed > 5000) {
        clearInterval(id);
        if (el) setContentReady(true);
      }
    }, 100);
    return () => clearInterval(id);
  }, [chapterContent]);

  const selection = useTextSelection(contentRef);
  const { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight, readingWidth, setReadingWidth } = useReaderSettings(bookId, loading);
  const [chapterScrollProgress, setChapterScrollProgress] = useState(0);
  const { sessionIdRef } = useReadingSession({ bookId, loading, currentChapter, chaptersLength: chapters.length, isPaused: ui.isPaused, scrollProgress: chapterScrollProgress, activeSeconds: ui.sessionElapsed });
  const studyMode = useStudyMode(bookId);

  // --- Progress & reading speed ---
  const { readingPph } = useReaderProgress({ bookId, loading, currentChapter, chapterScrollProgress, currentSegment });

  // --- Annotation actions ---
  const toastMessages = useMemo(() => ({
    failed_load_annotations: tRef.current('failed_load_annotations'),
    failed_save_highlight: tRef.current('failed_save_highlight'),
    failed_save_note: tRef.current('failed_save_note'),
    failed_remove_bookmark: tRef.current('failed_remove_bookmark'),
    failed_add_bookmark: tRef.current('failed_add_bookmark'),
    failed_delete_annotation: tRef.current('failed_delete_annotation'),
    failed_update_annotation: tRef.current('failed_update_annotation'),
    failed_save_progress: tRef.current('failed_save_progress'),
  }), []);

  // --- Chapter navigation (defined early for annotation scroll-to support) ---
  const navigatingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const handleChapterChange = useCallback(async (chapterIndex: number) => {
    if (navigatingRef.current) return;
    if (chapterIndex === currentChapter || chapterIndex < 0 || chapterIndex >= chapters.length) return;
    navigatingRef.current = true;
    setChapterFade('out');
    await new Promise<void>((r) => setTimeout(r, 150));
    if (!mountedRef.current) return;
    setCurrentChapter(chapterIndex);
    setChapterFade('in');
    try {
      const res = await api.patch(`/api/books/${bookId}`, { current_page: chapterIndex, current_segment: 0 });
      if (mountedRef.current && !res.success) {
        warn('useReaderPage: progress save returned success=false', res.error);
        toast(tRef.current('failed_save_progress'), 'error');
      }
    } catch (err) {
      warn('useReaderPage: progress save failed', err);
      if (mountedRef.current) toast(tRef.current('failed_save_progress'), 'error');
    } finally {
      navigatingRef.current = false;
    }
  }, [currentChapter, chapters.length, bookId, setChapterFade, setCurrentChapter, toast]);

  const annotationActions = useAnnotationActions({
    bookId, currentChapter, chapters, contentRef, selectionRange: selection.range,
    selectionOffsets: selection.offsets,
    annotations, setAnnotations,
    onChapterChange: handleChapterChange,
    toastError: (msg: string) => toast(msg, 'error'),
    toast: toastMessages,
  });

  // --- Selection & highlight state ---
  const { hasMadeSelection, setHasMadeSelection, highlightMode, setHighlightMode, bgEnabled, setBgEnabled } = useReaderSelectionState({ selection, annotationActions });

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

  // --- Capacitor status bar sync (delegated to useStatusBar) ---
  useStatusBar(theme === 'dark' ? 'DARK' : 'LIGHT', STATUS_BAR_COLORS[theme] || STATUS_BAR_COLORS.light);

  // --- Study mode chapter loading ---
  useEffect(() => {
    if (!loading && chapters.length > 0 && studyMode.enabled) {
      const ch = chapters[currentChapter];
      const content = ch?.rawContent || ch?.content || '';
      studyMode.loadChapterStudy(currentChapter, ch?.title || '', content);
    }
  }, [currentChapter, loading, chapters, studyMode.enabled, studyMode.loadChapterStudy]);

  // --- Milestones & completion ---
  useReaderMilestones({
    loading, chaptersLength: chapters.length, currentChapter, book,
    setShowCompletion: ui.setShowCompletion, setMilestone: ui.setMilestone,
  });

  // --- Genre detection ---
  const bookGenre: BookGenre = useMemo(() => detectGenre(
    (book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined,
    book?.title,
    (book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
  ), [book?.metadata, book?.title]);
  const isFiction = bookGenre === 'fiction';
  const chapterTitles = useMemo(() => chapters.map((ch) => ({ title: ch.title })), [chapters]);

  // --- Action handlers ---
  const { sessionSummary, setSessionSummary, handleBack, handleShowSettings, handleToggleStudyMode, handleBackToLibrary } = useReaderActions({
    currentChapter, sessionIdRef, ui, studyMode,
  });

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
    fontFamily, setFontFamily, lineHeight, setLineHeight, readingWidth, setReadingWidth,
    bgEnabled, setBgEnabled,
    highlightMode, setHighlightMode,
    readingPph, hasMadeSelection, setHasMadeSelection,
    sessionSummary, setSessionSummary,
    sessionIdRef,
    chapterScrollProgress, setChapterScrollProgress,
    // Genre
    isFiction, bookGenre, chapterTitles,
    // Memoized metadata
    genreMetadata: (book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined,
    bookDescription: (book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
    // Actions
    ui,
    handleChapterChange, handleBack, handleShowSettings, handleToggleStudyMode, handleBackToLibrary,
    setCurrentChapter, setCurrentSegment,
    annotationActions, selection,
    studyMode,
    contentReady,
  };
}
