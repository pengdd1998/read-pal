'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/Toast';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useAnnotationHighlights } from '@/hooks/useAnnotationHighlights';
import { useReaderSettings } from '@/hooks/useReaderSettings';
import { useReadingSession } from '@/hooks/useReadingSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { api } from '@/lib/api';
import type { Book, Chapter, Annotation } from '@read-pal/shared';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';

// Lazy-load heavy reading components — they're only needed on this page
const ReaderView = dynamic(() => import('@/components/reading/ReaderView').then((m) => ({ default: m.ReaderView })), { ssr: false });
const CompanionChat = dynamic(() => import('@/components/reading/CompanionChat').then((m) => ({ default: m.CompanionChat })), { ssr: false });
const SelectionToolbar = dynamic(() => import('@/components/reading/SelectionToolbar').then((m) => ({ default: m.SelectionToolbar })), { ssr: false });
const AnnotationsSidebar = dynamic(() => import('@/components/reading/AnnotationsSidebar').then((m) => ({ default: m.AnnotationsSidebar })), { ssr: false });
const ReadingBackground = dynamic(() => import('@/components/reading/ReadingBackground').then((m) => ({ default: m.ReadingBackground })), { ssr: false });
const InterventionToast = dynamic(() => import('@/components/reading/InterventionToast').then((m) => ({ default: m.InterventionToast })), { ssr: false });
const BookmarkToggle = dynamic(() => import('@/components/reading/BookmarkToggle').then((m) => ({ default: m.BookmarkToggle })), { ssr: false });
const SessionSummaryModal = dynamic(() => import('@/components/reading/SessionSummaryModal').then((m) => ({ default: m.SessionSummaryModal })), { ssr: false });
const BookCompletionModal = dynamic(() => import('@/components/reading/BookCompletionModal').then((m) => ({ default: m.BookCompletionModal })), { ssr: false });
const MobileSettingsSheet = dynamic(() => import('@/components/reading/MobileSettingsSheet').then((m) => ({ default: m.MobileSettingsSheet })), { ssr: false });
const SearchOverlay = dynamic(() => import('@/components/reading/SearchOverlay').then((m) => ({ default: m.SearchOverlay })), { ssr: false });

// Static theme maps — never change, so hoist to module scope
const THEME_CLASSES = {
  light: 'bg-[#fefdfb] text-gray-900',
  dark: 'bg-[#0f1419] text-gray-100',
  sepia: 'bg-[#f8f4ec] text-amber-900',
} as const;

const HEADER_BG_CLASSES = {
  light: 'bg-[#fdfbf7]/95 border-amber-200/50',
  dark: 'bg-[#1a1f26]/95 border-amber-900/30',
  sepia: 'bg-[#f5f0e6]/95 border-amber-300/50',
} as const;

/** Subtle selection hint that auto-dismisses after a few seconds. */
function SelectionHint({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in opacity-0" style={{ animation: 'fade-in 0.5s 1s forwards, fade-in 0.5s 5s reverse forwards' }}>
      <div className="px-3 py-1.5 rounded-full bg-amber-600/70 text-white text-xs backdrop-blur-sm">
        Select text to highlight or add notes
      </div>
    </div>
  );
}

/** Keyboard shortcuts help modal. */
function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { keys: ['\u2190', '\u2192'], label: 'Previous / Next chapter' },
    { keys: ['H'], label: 'Toggle highlight mode' },
    { keys: ['B'], label: 'Toggle bookmark' },
    { keys: ['T'], label: 'Table of contents' },
    { keys: ['Esc'], label: 'Close panel / modal' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
      role="button"
      aria-label="Close dialog"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Keyboard Shortcuts</h3>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2.5">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-300">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-gray-500 dark:text-gray-400 text-center">Swipe left/right on mobile to navigate chapters</p>
      </div>
    </div>
  );
}

/**
 * Compute character offsets for a DOM Range relative to a container element.
 */
function computeOffsets(range: Range, container: HTMLElement): { start: number; end: number } {
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}

export default function ReadPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;
  const { toast } = useToast();

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bgEnabled, setBgEnabled] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hasMadeSelection, setHasMadeSelection] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionSummary, setSessionSummary] = useState<{ duration: number; chaptersRead: number } | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [chapterFade, setChapterFade] = useState<'in' | 'out'>('in');
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Extracted settings hook
  const { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode } = useReaderSettings(bookId, loading);

  // Extracted session hook
  useReadingSession({ bookId, loading, currentChapter, chaptersLength: chapters.length });

  // Update session timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setSessionElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Auto-hide controls after 3s of inactivity ---
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const contentRef = useRef<HTMLElement | null>(null);
  const chatRef = useRef<CompanionChatHandle>(null);
  const selection = useTextSelection(contentRef);

  // Derive current chapter content from chapters array
  const chapterContent = chapters[currentChapter]?.rawContent || chapters[currentChapter]?.content || '';
  const chapterTitle = chapters[currentChapter]?.title || book?.title || '';

  // Track when user makes first selection
  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) setHasMadeSelection(true);
  }, [selection.isCollapsed, hasMadeSelection]);

  // Auto-highlight when highlight mode is active
  useEffect(() => {
    if (highlightMode && !selection.isCollapsed && selection.text) {
      handleAddHighlight(selection.text, 'amber');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMode, selection.isCollapsed]);

  // --- Annotation handlers ---
  const loadAnnotations = useCallback(async () => {
    try {
      const result = await api.get<Annotation[]>('/api/annotations', { bookId });
      if (result.success && result.data) {
        const data = result.data;
        setAnnotations(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
      toast('Failed to load annotations', 'error');
    }
  }, [bookId, toast]);

  const dismissSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }, []);

  const handleAddHighlight = useCallback(async (text: string, color: string, tags?: string[]) => {
    try {
      const chapter = chapters[currentChapter];
      const offsets = selection.range && contentRef.current
        ? computeOffsets(selection.range, contentRef.current)
        : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId, type: 'highlight', content: text, color,
        tags: tags || [],
        location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets },
      });

      if (result.success && result.data) {
        const annotation = result.data;
        setAnnotations((prev) => [...prev, annotation]);
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
      toast('Failed to save highlight', 'error');
    }
    dismissSelection();
  }, [bookId, currentChapter, chapters, selection.range, toast, dismissSelection]);

  const handleAddNote = useCallback(async (text: string, note: string) => {
    try {
      const chapter = chapters[currentChapter];
      const offsets = selection.range && contentRef.current
        ? computeOffsets(selection.range, contentRef.current)
        : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId, type: 'note', content: text, note,
        location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: offsets },
      });

      if (result.success && result.data) {
        const annotation = result.data;
        setAnnotations((prev) => [...prev, annotation]);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      toast('Failed to save note', 'error');
    }
    dismissSelection();
  }, [bookId, currentChapter, chapters, selection.range, toast, dismissSelection]);

  const handleChapterChange = useCallback(async (chapterIndex: number) => {
    if (chapterIndex === currentChapter) return;
    setChapterFade('out');
    await new Promise<void>((r) => setTimeout(r, 150));
    setCurrentChapter(chapterIndex);
    setChapterFade('in');

    try {
      await api.patch(`/api/books/${bookId}`, { currentPage: chapterIndex });
    } catch (err) {
      console.error('Failed to update progress:', err);
      toast('Failed to save progress', 'error');
    }
  }, [currentChapter, bookId, toast]);

  const handleToggleBookmark = useCallback(async () => {
    const isBookmarked = annotations.some(
      (a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter,
    );
    if (isBookmarked) {
      const bookmark = annotations.find(
        (a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter,
      );
      if (bookmark) {
        try {
          await api.delete(`/api/annotations/${bookmark.id}`);
          setAnnotations((prev) => prev.filter((a) => a.id !== bookmark.id));
        } catch (err) {
          console.error('Failed to remove bookmark:', err);
        }
      }
    } else {
      try {
        const chapter = chapters[currentChapter];
        const result = await api.post<Annotation>('/api/annotations', {
          bookId, type: 'bookmark',
          content: `Bookmark: ${chapter.title}`,
          location: { chapterId: chapter.id, pageIndex: currentChapter, position: 0, selection: { start: 0, end: 0 } },
        });
        if (result.success && result.data) {
          const annotation = result.data;
          setAnnotations((prev) => [...prev, annotation]);
        }
      } catch (err) {
        console.error('Failed to add bookmark:', err);
      }
    }
  }, [annotations, currentChapter, bookId, chapters]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/annotations/${id}`);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
      toast('Failed to delete annotation', 'error');
    }
  }, [toast]);

  const handleScrollToAnnotation = useCallback((annotation: Annotation) => {
    const mark = contentRef.current?.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const original = (mark as HTMLElement).style.backgroundColor;
      (mark as HTMLElement).style.backgroundColor = 'rgba(217, 119, 6, 0.5)';
      setTimeout(() => { (mark as HTMLElement).style.backgroundColor = original; }, 1500);
    }
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const handleUpdateAnnotation = useCallback((updated: Annotation) => {
    setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  // --- Keyboard shortcuts (extracted hook) ---
  useKeyboardShortcuts({
    currentChapter,
    chaptersLength: chapters.length,
    sidebarOpen,
    showShortcutsHelp,
    showMobileSettings,
    tocOpen,
    onChapterChange: handleChapterChange,
    onToggleBookmark: handleToggleBookmark,
    onSetHighlightMode: setHighlightMode,
    onSetTocOpen: setTocOpen,
    onSetShowShortcutsHelp: setShowShortcutsHelp,
    onSetSidebarOpen: setSidebarOpen,
    onSetShowMobileSettings: setShowMobileSettings,
  });

  // Render annotation highlights in the content
  useAnnotationHighlights(contentRef, annotations, currentChapter, theme);

  // --- Data loading ---
  useEffect(() => {
    let cancelled = false;
    const loadBookContent = async () => {
      try {
        setLoading(true);
        const [bookResult, annotationsResult] = await Promise.all([
          api.get<{ book: Book; chapters: Chapter[]; content: string }>(`/api/upload/books/${bookId}/content`),
          api.get<Annotation[]>('/api/annotations', { bookId }).catch(() => null),
        ]);
        if (cancelled) return;
        if (bookResult.success && bookResult.data) {
          const data = bookResult.data;
          setBook(data.book);
          setChapters(data.chapters ?? []);
          setCurrentChapter(data.book.currentPage || 0);
        } else {
          setError(bookResult.error?.message || 'Failed to load book');
        }
        if (annotationsResult?.success && annotationsResult.data) {
          const annData = annotationsResult.data;
          setAnnotations(Array.isArray(annData) ? annData : []);
        }
      } catch {
        if (!cancelled) setError('Failed to connect to server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBookContent();
    return () => { cancelled = true; };
  }, [bookId]);

  // Detect book completion
  useEffect(() => {
    if (!loading && chapters.length > 0 && currentChapter === chapters.length - 1) {
      const timer = setTimeout(() => setShowCompletion(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [currentChapter, chapters.length, loading]);

  // Milestone detection (25%, 50%, 75%)
  const [milestone, setMilestone] = useState<string | null>(null);
  const shownMilestones = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (loading || chapters.length === 0) return;
    const pct = ((currentChapter + 1) / chapters.length) * 100;
    for (const m of [25, 50, 75]) {
      if (pct >= m && !shownMilestones.current.has(m)) {
        shownMilestones.current.add(m);
        setMilestone(`${m}%`);
        const t = setTimeout(() => setMilestone(null), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [currentChapter, chapters.length, loading]);

  // Memoized counts
  const highlightCount = useMemo(
    () => annotations.filter((a) => a.type === 'highlight' && a.location?.pageIndex === currentChapter).length,
    [annotations, currentChapter],
  );
  const bookmarkCount = useMemo(() => annotations.filter((a) => a.type === 'bookmark').length, [annotations]);
  const totalHighlights = useMemo(() => annotations.filter((a) => a.type === 'highlight').length, [annotations]);
  const totalNotes = useMemo(() => annotations.filter((a) => a.type === 'note').length, [annotations]);
  const isBookmarked = useMemo(
    () => annotations.some((a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter),
    [annotations, currentChapter],
  );
  const chapterTitles = useMemo(() => chapters.map((ch) => ({ title: ch.title })), [chapters]);

  // Back button
  const handleBack = useCallback(() => {
    const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (elapsed > 30) {
      setSessionSummary({ duration: elapsed, chaptersRead: currentChapter + 1 });
    } else {
      router.push('/library');
    }
  }, [currentChapter, router]);

  const handleToggleControls = useCallback(() => {
    setShowControls((v) => {
      if (!v) resetAutoHideTimer();
      return !v;
    });
  }, [resetAutoHideTimer]);

  // --- Render ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fefdfb]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !book || chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold mb-4">{error || 'Unable to load book'}</p>
          <a href="/library" className="btn btn-primary">Back to Library</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative">
      <ReadingBackground content={chapterContent} enabled={bgEnabled} />

      {/* Top bar */}
      <div
        className={`relative z-10 flex items-center justify-between px-3 py-2 border-b backdrop-blur-sm ${HEADER_BG_CLASSES[theme]} transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none absolute'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleBack} className="flex items-center justify-center w-11 h-11 -ml-1 rounded-xl text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors" aria-label="Back to library">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">{book.title}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
              {book.author && `${book.author} · `}Ch. {currentChapter + 1} of {chapters.length}
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-500 ml-2 flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {Math.floor(sessionElapsed / 60)}:{String(sessionElapsed % 60).padStart(2, '0')}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mobile settings button */}
          <div className="flex sm:hidden items-center gap-0.5">
            <button onClick={() => setShowMobileSettings(true)} className="flex items-center justify-center w-11 h-11 rounded-lg text-sm text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors active:scale-95" aria-label="Reading settings">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          {/* Desktop Font Size */}
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors" aria-label="Decrease font size">A-</button>
            <span className="text-xs text-amber-600 dark:text-amber-400 min-w-[2rem] text-center font-medium">{fontSize}</span>
            <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors" aria-label="Increase font size">A+</button>
          </div>

          {/* Desktop Theme Toggle */}
          <div className="hidden sm:flex gap-0.5">
            {(['light', 'sepia', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                  theme === t
                    ? t === 'light' ? 'bg-amber-100 text-amber-800' : t === 'dark' ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-200 text-amber-900'
                    : 'text-gray-400 hover:text-amber-600 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'
                }`}
                aria-label={`${t} theme`}
              >
                {t === 'light' ? '\u2600\uFE0F' : t === 'sepia' ? '\uD83D\uDCD6' : '\uD83C\uDF19'}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-amber-200/50 dark:bg-amber-900/30 mx-1 hidden sm:block" />

          {/* Quiet mode */}
          <button onClick={() => setQuietMode((v) => !v)} className={`hidden sm:flex p-2 rounded-lg text-xs font-medium transition-colors items-center gap-1 ${quietMode ? 'text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/30' : 'text-gray-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'}`} title={quietMode ? 'Quiet mode on' : 'Enable quiet mode'}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          </button>

          {/* Search */}
          <button onClick={() => setSearchOpen(!searchOpen)} className={`p-2 rounded-lg text-sm transition-colors ${searchOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'}`} aria-label="Search in book">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Background toggle */}
          <button onClick={() => setBgEnabled(!bgEnabled)} className={`hidden sm:flex p-2 rounded-lg text-xs font-medium transition-colors items-center gap-1 ${bgEnabled ? 'text-amber-600 dark:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30' : 'text-gray-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'}`} title={bgEnabled ? 'Disable dynamic background' : 'Enable dynamic background'}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <BookmarkToggle isBookmarked={isBookmarked} onToggle={handleToggleBookmark} />

          {/* Annotations badge */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${sidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300'}`} aria-label="Toggle annotations sidebar">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {annotations.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold">{annotations.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 dark:bg-gray-800">
        <div className="h-full bg-gradient-to-r from-amber-400 to-teal-500 transition-all duration-500 ease-out" style={{ width: `${chapters.length > 0 ? ((currentChapter + 1) / chapters.length) * 100 : 0}%` }} />
      </div>

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          searchQuery={searchQuery}
          onQueryChange={setSearchQuery}
          currentChapter={currentChapter}
          chapters={chapters}
          onNavigate={(idx) => handleChapterChange(idx)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Main content */}
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'md:mr-[360px]' : ''}`}>
        <div className={`h-full ${THEME_CLASSES[theme]} transition-colors duration-200 ${chapterFade === 'out' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}>
          <ReaderView
            bookId={bookId}
            chapterContent={chapterContent}
            chapterTitle={chapters[currentChapter]?.title || book.title}
            currentPage={currentChapter}
            totalPages={chapters.length || 1}
            chapters={chapterTitles}
            onPageChange={handleChapterChange}
            contentRef={contentRef}
            fontSize={fontSize}
            theme={theme}
            showControls={showControls}
            onToggleControls={handleToggleControls}
            highlightMode={highlightMode}
            highlightCount={highlightCount}
            bookmarkCount={bookmarkCount}
            externalTocOpen={tocOpen}
            onTocClose={() => setTocOpen(false)}
          />
        </div>
      </div>

      {/* Selection hint */}
      {!hasMadeSelection && <SelectionHint onDismiss={() => setHasMadeSelection(true)} />}

      {/* Selection toolbar */}
      {!selection.isCollapsed && selection.rect && (
        <SelectionToolbar
          text={selection.text}
          rect={selection.rect}
          range={selection.range}
          bookTitle={book?.title}
          author={book?.author}
          onHighlight={handleAddHighlight}
          onNote={handleAddNote}
          onDismiss={dismissSelection}
          onAskAI={(text) => {
            const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
            chatRef.current?.openWithMessage(`Can you explain this passage: '${truncated}'`);
          }}
        />
      )}

      {/* Annotations sidebar */}
      <AnnotationsSidebar
        annotations={annotations}
        bookId={bookId}
        bookTitle={book?.title}
        author={book?.author}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDeleteAnnotation={handleDeleteAnnotation}
        onUpdateAnnotation={handleUpdateAnnotation}
        onScrollToAnnotation={handleScrollToAnnotation}
      />

      {/* Companion chat */}
      <CompanionChat
        ref={chatRef}
        bookId={bookId}
        currentPage={currentChapter}
        totalPages={chapters.length}
        bookTitle={book?.title || ''}
        author={book?.author || ''}
        chapterContent={chapterContent}
      />

      {/* Intervention toast */}
      {!loading && book && !quietMode && (
        <InterventionToast
          bookId={bookId}
          currentPage={currentChapter}
          totalPages={chapters.length}
          sessionDuration={Math.round((Date.now() - sessionStartRef.current) / 1000)}
          highlightCount={totalHighlights}
        />
      )}

      {/* Book completion */}
      {showCompletion && book && (
        <BookCompletionModal
          bookTitle={book.title}
          totalHighlights={totalHighlights}
          totalNotes={totalNotes}
          totalChapters={chapters.length}
          onClose={() => setShowCompletion(false)}
        />
      )}

      {/* Session summary */}
      {sessionSummary && (
        <SessionSummaryModal
          duration={sessionSummary.duration}
          chaptersRead={sessionSummary.chaptersRead}
          totalChapters={chapters.length}
          onKeepReading={() => setSessionSummary(null)}
          onBackToLibrary={() => { setSessionSummary(null); router.push('/library'); }}
        />
      )}

      {/* Highlight mode indicator */}
      {highlightMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium shadow-lg animate-fade-in">
          Highlight mode on — select text to highlight
        </div>
      )}

      {/* Milestone toast */}
      {milestone && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 to-teal-500 text-white text-sm font-semibold shadow-lg">
            {'\uD83C\uDF1F'} {milestone} complete!
          </div>
        </div>
      )}

      {/* Mobile settings */}
      {showMobileSettings && (
        <MobileSettingsSheet
          fontSize={fontSize}
          theme={theme}
          quietMode={quietMode}
          onFontSizeChange={setFontSize}
          onThemeChange={setTheme}
          onQuietModeChange={setQuietMode}
          onClose={() => setShowMobileSettings(false)}
        />
      )}

      {/* Shortcuts help button */}
      <button
        onClick={() => setShowShortcutsHelp(true)}
        className="hidden sm:flex fixed bottom-5 right-5 z-20 w-11 h-11 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 shadow-sm transition-all active:scale-95 items-center justify-center group"
        aria-label="Keyboard shortcuts help"
        title="Keyboard shortcuts (?)"
      >
        <span className="text-sm font-bold group-hover:text-amber-500 transition-colors">?</span>
      </button>

      {showShortcutsHelp && <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
    </div>
  );
}
