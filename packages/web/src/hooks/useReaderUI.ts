'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ReaderUIState {
  showControls: boolean;
  sidebarOpen: boolean;
  synthesisOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  showMobileSettings: boolean;
  tocOpen: boolean;
  showSettingsMenu: boolean;
  showTimeline: boolean;
  showShortcutsHelp: boolean;
  showCompletion: boolean;
  isPaused: boolean;
  sessionElapsed: number;
  milestone: string | null;
  sessionStartRef: React.MutableRefObject<number>;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSynthesisOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowMobileSettings: React.Dispatch<React.SetStateAction<boolean>>;
  setTocOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCompletion: React.Dispatch<React.SetStateAction<boolean>>;
  setMilestone: React.Dispatch<React.SetStateAction<string | null>>;
  resetAutoHideTimer: () => void;
  handleToggleControls: () => void;
  closeToc: () => void;
}

export function useReaderUI(): ReaderUIState {
  const [showControls, setShowControls] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [synthesisOpen, setSynthesisOpen] = useState(false);

  // Enforce mutual exclusion: opening one panel closes the other
  useEffect(() => {
    if (sidebarOpen) setSynthesisOpen(false);
  }, [sidebarOpen]);
  useEffect(() => {
    if (synthesisOpen) setSidebarOpen(false);
  }, [synthesisOpen]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [milestone, setMilestone] = useState<string | null>(null);

  const sessionStartRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused) {
        const pausedMs = totalPausedMsRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
        setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current - pausedMs) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isPaused]);

  // Auto-pause after 5 min inactivity
  const IDLE_TIMEOUT = 5 * 60 * 1000;
  const handleUserActivity = useCallback(() => {
    if (pausedAtRef.current) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
      setIsPaused(false);
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsPaused(true);
      pausedAtRef.current = Date.now();
    }, IDLE_TIMEOUT);
  }, []);

  useEffect(() => {
    const events = ['scroll', 'click', 'keydown', 'touchstart', 'mousemove'] as const;
    const handler = () => handleUserActivity();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    handleUserActivity();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [handleUserActivity]);

  // Auto-hide controls after 3s
  const resetAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetAutoHideTimer();
    return () => { if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current); };
  }, [resetAutoHideTimer]);

  useEffect(() => {
    const handleScroll = () => { if (showControls) resetAutoHideTimer(); };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showControls, resetAutoHideTimer]);

  const handleToggleControls = useCallback(() => {
    setShowControls((v) => {
      if (!v) resetAutoHideTimer();
      return !v;
    });
  }, [resetAutoHideTimer]);

  const closeToc = useCallback(() => setTocOpen(false), []);

  return {
    showControls, sidebarOpen, synthesisOpen, searchOpen, searchQuery,
    showMobileSettings, tocOpen, showSettingsMenu, showTimeline,
    showShortcutsHelp, showCompletion, isPaused, sessionElapsed, milestone,
    sessionStartRef,
    setShowControls, setSidebarOpen, setSynthesisOpen, setSearchOpen, setSearchQuery,
    setShowMobileSettings, setTocOpen, setShowSettingsMenu, setShowTimeline,
    setShowShortcutsHelp, setShowCompletion, setMilestone,
    resetAutoHideTimer, handleToggleControls, closeToc,
  };
}
