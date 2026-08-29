'use client';

import { useState, useEffect, useCallback, useRef, useReducer } from 'react';

type PanelName = 'sidebar' | 'synthesis' | 'readingPlan' | 'search' | 'settings' | 'timeline' | 'chat';

interface PanelState {
  sidebar: boolean;
  synthesis: boolean;
  readingPlan: boolean;
  search: boolean;
  settings: boolean;
  timeline: boolean;
  chat: boolean;
}

type PanelAction = { panel: PanelName; open: boolean } | { panel: 'closeAll'; open: false };

const initialPanelState: PanelState = {
  sidebar: false,
  synthesis: false,
  readingPlan: false,
  search: false,
  settings: false,
  timeline: false,
  chat: false,
};

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  if (action.panel === 'closeAll') return initialPanelState;
  const open = action.open;
  if (!open) {
    return { ...state, [action.panel]: false };
  }
  // Mutual exclusion: close all others when opening a panel
  return { ...initialPanelState, [action.panel]: true };
}

export interface ReaderUIState {
  showControls: boolean;
  sidebarOpen: boolean;
  synthesisOpen: boolean;
  readingPlanOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  showMobileSettings: boolean;
  tocOpen: boolean;
  showSettingsMenu: boolean;
  showTimeline: boolean;
  showShortcutsHelp: boolean;
  showCompletion: boolean;
  chatOpen: boolean;
  isPaused: boolean;
  sessionElapsed: number;
  milestone: string | null;
  sessionStartRef: React.MutableRefObject<number>;
  setShowControls: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSynthesisOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReadingPlanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setShowMobileSettings: React.Dispatch<React.SetStateAction<boolean>>;
  setTocOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcutsHelp: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCompletion: React.Dispatch<React.SetStateAction<boolean>>;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMilestone: React.Dispatch<React.SetStateAction<string | null>>;
  resetAutoHideTimer: () => void;
  pauseAutoHide: () => void;
  resumeAutoHide: () => void;
  handleToggleControls: () => void;
  closeToc: () => void;
  closeAllPanels: () => void;
}

export function useReaderUI(): ReaderUIState {
  const [showControls, setShowControls] = useState(true);
  const [panels, dispatchPanel] = useReducer(panelReducer, initialPanelState);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [milestone, setMilestone] = useState<string | null>(null);

  const sessionStartRef = useRef<number>(Date.now());
  const pausedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef<number>(0);
  // True while the timer is paused because the tab is hidden (visibilitychange).
  // Distinguishes a visibility-pause from a user/idle pause so we only resume our own.
  const hiddenPausedRef = useRef(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typed panel setters
  const setSidebarOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.sidebar) : v;
    if (next) dispatchPanel({ panel: 'sidebar', open: true });
    else dispatchPanel({ panel: 'sidebar', open: false });
  }, [panels.sidebar]);

  const setSynthesisOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.synthesis) : v;
    dispatchPanel({ panel: 'synthesis', open: next });
  }, [panels.synthesis]);

  const setReadingPlanOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.readingPlan) : v;
    dispatchPanel({ panel: 'readingPlan', open: next });
  }, [panels.readingPlan]);

  const setSearchOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.search) : v;
    dispatchPanel({ panel: 'search', open: next });
  }, [panels.search]);

  const setShowSettingsMenu = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.settings) : v;
    dispatchPanel({ panel: 'settings', open: next });
  }, [panels.settings]);

  const setShowTimeline = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.timeline) : v;
    dispatchPanel({ panel: 'timeline', open: next });
  }, [panels.timeline]);

  const setChatOpen = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(panels.chat) : v;
    dispatchPanel({ panel: 'chat', open: next });
  }, [panels.chat]);

  // Session timer — update ref, only setState when value changes
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isPaused) {
        const pausedMs = totalPausedMsRef.current + (pausedAtRef.current ? Date.now() - pausedAtRef.current : 0);
        const elapsed = Math.floor((Date.now() - sessionStartRef.current - pausedMs) / 1000);
        setSessionElapsed((prev) => prev === elapsed ? prev : elapsed);
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

  // Pause the session timer while the tab is hidden. Browsers throttle
  // setTimeout/setInterval in background tabs, so the 5-min idle auto-pause
  // above fires late (or not at all) when the user switches away — without
  // this, switched-away wall-clock keeps counting as reading time, which is
  // the main source of reading-time inflation (sessions pegged at the 2h
  // cap). visibilitychange fires reliably even in background tabs.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        // Only start a visibility pause if the timer isn't already paused
        // (by the user or idle) — pausedAtRef is shared with that path.
        if (pausedAtRef.current === null) {
          pausedAtRef.current = Date.now();
          hiddenPausedRef.current = true;
        }
      } else if (hiddenPausedRef.current) {
        // Resume only the pause WE started (not a user/idle pause).
        totalPausedMsRef.current += Date.now() - (pausedAtRef.current ?? Date.now());
        pausedAtRef.current = null;
        hiddenPausedRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Auto-hide controls after 3s
  const resetAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    autoHideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const pauseAutoHide = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const resumeAutoHide = useCallback(() => {
    resetAutoHideTimer();
  }, [resetAutoHideTimer]);

  useEffect(() => {
    resetAutoHideTimer();
    return () => { if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current); };
  }, [resetAutoHideTimer]);

  // Scroll-direction-aware chrome (Brave/Kindle/Readwise pattern):
  // scrolling down hides controls immediately; scrolling up reveals them.
  // The 3s idle timer stays as a fallback for trackpads that emit tiny
  // jitters, but the direction signal does the real work.
  useEffect(() => {
    let rafId = 0;
    let lastY: number | null = null;
    const DIRECTION_THRESHOLD = 8; // px — ignore micro-jitter
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | Document;
      // Only react to the reading container's scroll, not inner panels
      if (!(target instanceof HTMLElement) || !target.classList?.contains('reading-scroll-container')) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const y = target.scrollTop;
        if (lastY === null) { lastY = y; return; }
        const delta = y - lastY;
        if (Math.abs(delta) < DIRECTION_THRESHOLD) return;
        lastY = y;
        if (delta > 0) {
          // scrolling down — immerse
          setShowControls(false);
        } else {
          // scrolling up — reveal and restart the idle hide
          setShowControls(true);
          resetAutoHideTimer();
        }
      });
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [resetAutoHideTimer]);

  const handleToggleControls = useCallback(() => {
    setShowControls((v) => {
      if (!v) resetAutoHideTimer();
      return !v;
    });
  }, [resetAutoHideTimer]);

  const closeToc = useCallback(() => setTocOpen(false), []);

  const closeAllPanels = useCallback(() => {
    dispatchPanel({ panel: 'closeAll', open: false });
  }, []);

  return {
    showControls,
    sidebarOpen: panels.sidebar,
    synthesisOpen: panels.synthesis,
    readingPlanOpen: panels.readingPlan,
    searchOpen: panels.search,
    searchQuery,
    showMobileSettings, tocOpen,
    showSettingsMenu: panels.settings,
    showTimeline: panels.timeline,
    showShortcutsHelp, showCompletion,
    chatOpen: panels.chat,
    isPaused, sessionElapsed, milestone,
    sessionStartRef,
    setShowControls, setSidebarOpen, setSynthesisOpen, setReadingPlanOpen, setSearchOpen, setSearchQuery,
    setShowMobileSettings, setTocOpen, setShowSettingsMenu, setShowTimeline,
    setShowShortcutsHelp, setShowCompletion, setChatOpen, setMilestone,
    resetAutoHideTimer, pauseAutoHide, resumeAutoHide, handleToggleControls, closeToc, closeAllPanels,
  };
}
