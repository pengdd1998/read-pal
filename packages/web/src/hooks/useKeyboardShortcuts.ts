'use client';

import React, { useEffect, useRef } from 'react';

interface UseKeyboardShortcutsOptions {
  currentChapter: number;
  chaptersLength: number;
  sidebarOpen: boolean;
  showShortcutsHelp: boolean;
  showMobileSettings: boolean;
  tocOpen: boolean;
  synthesisOpen?: boolean;
  onChapterChange: (idx: number) => void;
  onToggleBookmark: () => void;
  onSetHighlightMode: React.Dispatch<React.SetStateAction<boolean>>;
  onSetTocOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowMobileSettings: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSynthesisOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useKeyboardShortcuts({
  currentChapter,
  chaptersLength,
  sidebarOpen,
  showShortcutsHelp,
  showMobileSettings,
  tocOpen,
  synthesisOpen,
  onChapterChange,
  onToggleBookmark,
  onSetHighlightMode,
  onSetTocOpen,
  onSetShowShortcutsHelp,
  onSetSidebarOpen,
  onSetShowMobileSettings,
  onSetSynthesisOpen,
}: UseKeyboardShortcutsOptions) {
  // Refs for stable handler access
  const chapterChangeRef = useRef(onChapterChange);
  const toggleBookmarkRef = useRef(onToggleBookmark);

  // Keep refs in sync
  chapterChangeRef.current = onChapterChange;
  toggleBookmarkRef.current = onToggleBookmark;

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return;

      // Escape — close any open overlay
      if (e.key === 'Escape') {
        if (showShortcutsHelp) { onSetShowShortcutsHelp(false); return; }
        if (showMobileSettings) { onSetShowMobileSettings(false); return; }
        if (synthesisOpen && onSetSynthesisOpen) { onSetSynthesisOpen(false); return; }
        if (sidebarOpen) { onSetSidebarOpen(false); return; }
        if (tocOpen) { onSetTocOpen(false); return; }
        return;
      }

      // ArrowLeft / ArrowRight — chapter navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentChapter > 0) chapterChangeRef.current(currentChapter - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentChapter < chaptersLength - 1) chapterChangeRef.current(currentChapter + 1);
        return;
      }

      // H — toggle highlight mode
      if (e.key === 'h' || e.key === 'H') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onSetHighlightMode((v) => !v);
        }
        return;
      }

      // B — toggle bookmark
      if (e.key === 'b' || e.key === 'B') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          toggleBookmarkRef.current();
        }
        return;
      }

      // T — toggle table of contents
      if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          onSetTocOpen((v) => !v);
        }
        return;
      }

      // ? — show shortcuts help
      if (e.key === '?') {
        e.preventDefault();
        onSetShowShortcutsHelp(true);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [
    currentChapter,
    chaptersLength,
    sidebarOpen,
    showShortcutsHelp,
    showMobileSettings,
    tocOpen,
    synthesisOpen,
    onSetShowShortcutsHelp,
    onSetShowMobileSettings,
    onSetSidebarOpen,
    onSetTocOpen,
    onSetHighlightMode,
    onSetSynthesisOpen,
  ]);

  return { chapterChangeRef, toggleBookmarkRef };
}
