'use client';

import { useCallback } from 'react';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import type { MutableRefObject } from 'react';

interface ReaderCallbacksDeps {
  setHasMadeSelection: (v: boolean) => void;
  setSessionSummary: (v: { duration: number; chaptersRead: number; sessionId: string } | null) => void;
  chatHandleRef: MutableRefObject<CompanionChatHandle | null>;
  t: (key: string, params?: Record<string, unknown>) => string; // next-intl Translator compatible
  handleChapterChange: (chapter: number) => void;
  setShowTimeline: (v: boolean) => void;
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setSynthesisOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setReadingPlanOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowSettingsMenu: (v: boolean) => void;
  setShowShortcutsHelp: (v: boolean) => void;
  setShowCompletion: (v: boolean) => void;
  setShowMobileSettings: (v: boolean) => void;
  setShowTimelineDirect: (v: boolean) => void;
}

export function useReaderCallbacks(deps: ReaderCallbacksDeps) {
  const {
    setHasMadeSelection, setSessionSummary, chatHandleRef, t,
    handleChapterChange, setShowTimeline,
    setSearchOpen, setSidebarOpen, setSynthesisOpen, setReadingPlanOpen,
    setShowSettingsMenu, setShowShortcutsHelp,
    setShowCompletion, setShowMobileSettings, setShowTimelineDirect,
  } = deps;

  const handleToggleSearch = useCallback(() => setSearchOpen((v: boolean) => !v), [setSearchOpen]);
  const handleToggleSidebar = useCallback(() => setSidebarOpen((v: boolean) => !v), [setSidebarOpen]);
  const handleToggleSynthesis = useCallback(() => setSynthesisOpen((v: boolean) => !v), [setSynthesisOpen]);
  const handleToggleReadingPlan = useCallback(() => setReadingPlanOpen((v: boolean) => !v), [setReadingPlanOpen]);
  const handleShowTimelineCb = useCallback(() => setShowTimeline(true), [setShowTimeline]);
  const handleCloseSettingsMenu = useCallback(() => setShowSettingsMenu(false), [setShowSettingsMenu]);
  const handleOpenShortcutsHelp = useCallback(() => setShowShortcutsHelp(true), [setShowShortcutsHelp]);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), [setSearchOpen]);
  const handleCloseSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);
  const handleCloseSynthesis = useCallback(() => setSynthesisOpen(false), [setSynthesisOpen]);
  const handleCloseReadingPlan = useCallback(() => setReadingPlanOpen(false), [setReadingPlanOpen]);
  const handleCloseCompletion = useCallback(() => setShowCompletion(false), [setShowCompletion]);
  const handleCloseMobileSettings = useCallback(() => setShowMobileSettings(false), [setShowMobileSettings]);
  const handleCloseShortcutsHelp = useCallback(() => setShowShortcutsHelp(false), [setShowShortcutsHelp]);
  const handleCloseTimeline = useCallback(() => setShowTimelineDirect(false), [setShowTimelineDirect]);
  const handleDismissSelectionHint = useCallback(() => setHasMadeSelection(true), [setHasMadeSelection]);
  const handleDismissSessionSummary = useCallback(() => setSessionSummary(null), [setSessionSummary]);

  const handleAskAISelection = useCallback((text: string) => {
    const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
    chatHandleRef.current?.openWithMessage(t('explain_passage_prompt', { text: truncated }));
  }, [chatHandleRef, t]);

  const handleCompanionReady = useCallback((handle: CompanionChatHandle) => {
    chatHandleRef.current = handle;
  }, [chatHandleRef]);

  const handleAskAboutCharacter = useCallback((name: string) => {
    chatHandleRef.current?.openWithMessage(t('tell_about_character_prompt', { name }));
  }, [chatHandleRef, t]);

  const handleTimelineChapterSelect = useCallback((i: number) => {
    handleChapterChange(i);
    setShowTimeline(false);
  }, [handleChapterChange, setShowTimeline]);

  return {
    handleToggleSearch,
    handleToggleSidebar,
    handleToggleSynthesis,
    handleToggleReadingPlan,
    handleShowTimelineCb,
    handleCloseSettingsMenu,
    handleOpenShortcutsHelp,
    handleCloseSearch,
    handleCloseSidebar,
    handleCloseSynthesis,
    handleCloseReadingPlan,
    handleCloseCompletion,
    handleCloseMobileSettings,
    handleCloseShortcutsHelp,
    handleCloseTimeline,
    handleDismissSelectionHint,
    handleDismissSessionSummary,
    handleAskAISelection,
    handleCompanionReady,
    handleAskAboutCharacter,
    handleTimelineChapterSelect,
  };
}
