'use client';

import { useState, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { ReaderUIState } from '@/hooks/useReaderUI';

interface StudyModeLike {
  enabled: boolean;
  toggleStudyMode: () => void;
}

interface UseReaderActionsOptions {
  currentChapter: number;
  sessionIdRef: React.MutableRefObject<string | null>;
  ui: ReaderUIState;
  studyMode: StudyModeLike;
}

export interface SessionSummary {
  duration: number;
  chaptersRead: number;
  sessionId?: string;
}

/**
 * Provides action handlers for the reader page:
 * back button (with session summary), settings panel toggle,
 * study mode toggle, and back-to-library navigation.
 */
export function useReaderActions({
  currentChapter,
  sessionIdRef,
  ui,
  studyMode,
}: UseReaderActionsOptions) {
  const router = useRouter();
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);

  const handleBack = useCallback(() => {
    const elapsed = ui.sessionElapsed;
    if (elapsed > 30) {
      setSessionSummary({ duration: elapsed, chaptersRead: currentChapter + 1, sessionId: sessionIdRef.current || undefined });
    } else {
      router.push('/library');
    }
  }, [currentChapter, router, sessionIdRef, ui.sessionElapsed]);

  const handleShowSettings = useCallback(() => {
    if (window.innerWidth < 640) {
      ui.setShowMobileSettings(true);
    } else {
      ui.setShowSettingsMenu((v: boolean) => !v);
    }
  }, [ui.setShowMobileSettings, ui.setShowSettingsMenu]);

  const handleToggleStudyMode = useCallback(() => {
    if (!studyMode.enabled) ui.closeAllPanels();
    studyMode.toggleStudyMode();
  }, [studyMode.enabled, studyMode.toggleStudyMode, ui.closeAllPanels]);

  const handleBackToLibrary = useCallback(() => {
    setSessionSummary(null);
    router.push('/library');
  }, [router]);

  return {
    sessionSummary,
    setSessionSummary,
    handleBack,
    handleShowSettings,
    handleToggleStudyMode,
    handleBackToLibrary,
  };
}
