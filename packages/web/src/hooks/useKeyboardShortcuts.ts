'use client';

import React, { useEffect, useRef } from 'react';

interface UseKeyboardShortcutsOptions {
  sidebarOpen: boolean;
  showShortcutsHelp: boolean;
  showMobileSettings: boolean;
  tocOpen: boolean;
  synthesisOpen?: boolean;
  onToggleBookmark: () => void;
  onSetHighlightMode: React.Dispatch<React.SetStateAction<boolean>>;
  onSetTocOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetShowMobileSettings: React.Dispatch<React.SetStateAction<boolean>>;
  onSetSynthesisOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useKeyboardShortcuts({
  sidebarOpen,
  showShortcutsHelp,
  showMobileSettings,
  tocOpen,
  synthesisOpen,
  onToggleBookmark,
  onSetHighlightMode,
  onSetTocOpen,
  onSetShowShortcutsHelp,
  onSetSidebarOpen,
  onSetShowMobileSettings,
  onSetSynthesisOpen,
}: UseKeyboardShortcutsOptions) {
  // Refs for stable handler access
  const toggleBookmarkRef = useRef(onToggleBookmark);

  // Keep refs in sync
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

      // ArrowLeft / ArrowRight — owned by useReaderKeyboardNav (pagination-
      // aware: plain arrows page segments, Shift+arrows jump chapters). This
      // hook used to ALSO navigate chapters on plain arrows; both listeners
      // are window-level, so every keypress double-navigated (segment+1 then
      // chapter+1), landing the reader a whole chapter ahead.

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

  return { toggleBookmarkRef };
}
