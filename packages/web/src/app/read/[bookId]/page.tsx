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
import { useStudyMode } from '@/hooks/useStudyMode';
import { api } from '@/lib/api';
import type { Book, Chapter, Annotation } from '@read-pal/shared';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import { detectGenre, type BookGenre } from '@/lib/companion-prompts';

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
const SynthesisPanel = dynamic(() => import('@/components/reading/SynthesisPanel').then((m) => ({ default: m.SynthesisPanel })), { ssr: false });
const StudyModePanel = dynamic(() => import('@/components/reading/StudyModePanel').then((m) => ({ default: m.StudyModePanel })), { ssr: false });
const FictionPanel = dynamic(() => import('@/components/reading/FictionPanel').then((m) => ({ default: m.FictionPanel })), { ssr: false });

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

/**
 * Subtle selection hint for new readers.
 * For first-time users (no localStorage flag), the hint stays until dismissed or used.
 * After the user has used text selection once, it only shows for 3s as a gentle reminder.
 */
function SelectionHint({ onDismiss }: { onDismiss: () => void }) {
  const isReturningUser = typeof window !== 'undefined' && localStorage.getItem('read-pal-selection-used') === 'true';

  useEffect(() => {
    // Returning users: auto-dismiss after 3s. First-time users: stays until dismissed.
    if (isReturningUser) {
      const t = setTimeout(onDismiss, 3000);
      return () => clearTimeout(t);
    }
  }, [onDismiss, isReturningUser]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 animate-fade-in" style={{ animation: 'fade-in 0.5s 1.5s forwards' }}>
      <div className={`px-4 py-2 rounded-xl text-white text-sm backdrop-blur-sm shadow-lg flex items-center gap-2 pointer-events-auto ${
        isReturningUser ? 'bg-amber-600/60' : 'bg-amber-600/80'
      }`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span>{isReturningUser ? 'Tip: Select text to interact' : 'Select any text to highlight, add notes, or ask AI'}</span>
        <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
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
  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + range.toString().length;
    return { start, end };
  } catch {
    return { start: 0, end: range.toString().length };
  }
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
  const [synthesisOpen, setSynthesisOpen] = useState(false);
  const [hasMadeSelection, setHasMadeSelection] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('read-pal-selection-used') === 'true';
  });
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
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const sessionStartRef = useRef<number>(Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // Study mode
  const studyMode = useStudyMode(bookId);

  // Extracted settings hook
  const { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight } = useReaderSettings(bookId, loading);

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

  // Genre detection for fiction-specific features
  const bookGenre: BookGenre = detectGenre(
    (book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | undefined,
    book?.title,
    (book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
  );
  const isFiction = bookGenre === 'fiction';

  // Track when user makes first selection
  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) {
      setHasMadeSelection(true);
      try { localStorage.setItem('read-pal-selection-used', 'true'); } catch { /* ignore */ }
    }
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
      if (!chapter) return;
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
      if (!chapter) return;
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
    if (chapterIndex === currentChapter || chapterIndex < 0 || chapterIndex >= chapters.length) return;
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
          toast('Failed to remove bookmark', 'error');
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
        toast('Failed to add bookmark', 'error');
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

  // Load study mode data when chapter changes
  useEffect(() => {
    if (!loading && chapters.length > 0 && studyMode.enabled) {
      const ch = chapters[currentChapter];
      const content = ch?.rawContent || ch?.content || '';
      studyMode.loadChapterStudy(currentChapter, ch?.title || '', content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, loading, chapters.length, studyMode.enabled]);

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

      {/* Top bar — clean and minimal */}
      <div
        className={`relative z-10 flex items-center justify-between px-3 py-2 border-b backdrop-blur-sm ${HEADER_BG_CLASSES[theme]} transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none absolute'
        }`}
      >
        {/* Left: Back + Book info */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={handleBack} className="flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" aria-label="Back to library">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">{book.title}</h1>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {book.author && `${book.author} · `}Ch. {currentChapter + 1}/{chapters.length}
            </p>
          </div>
        </div>

        {/* Right: Essential actions only */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Search */}
          <button onClick={() => setSearchOpen(!searchOpen)} className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm transition-colors ${searchOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label="Search">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <BookmarkToggle isBookmarked={isBookmarked} onToggle={handleToggleBookmark} />

          {/* Annotations */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm transition-colors relative ${sidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label="Annotations">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {annotations.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold">{annotations.length}</span>
            )}
          </button>

          {/* Study mode toggle */}
          <button onClick={studyMode.toggleStudyMode} className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm transition-colors ${studyMode.enabled ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`} aria-label="Study mode" title="Study mode">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>

          {/* Synthesis */}
          <button onClick={() => setSynthesisOpen(!synthesisOpen)} className={`w-10 h-10 hidden sm:flex items-center justify-center rounded-lg text-sm transition-colors ${synthesisOpen ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20'}`} aria-label="Synthesize">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </button>

          {/* Settings dropdown trigger */}
          <div className="relative">
            <button
              onClick={() => {
                // On mobile, use the full settings sheet
                if (window.innerWidth < 640) {
                  setShowMobileSettings(true);
                } else {
                  setShowSettingsMenu(!showSettingsMenu);
                }
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm transition-colors ${showSettingsMenu ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
              aria-label="Settings"
            >
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            {/* Desktop settings dropdown */}
            {showSettingsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)} />
                <div className={`absolute right-0 top-full mt-1 z-50 w-64 rounded-xl shadow-xl border p-3 space-y-3 ${
                  theme === 'dark' ? 'bg-gray-800 border-gray-700' : theme === 'sepia' ? 'bg-[#f5f0e6] border-amber-200' : 'bg-white border-gray-200'
                }`}>
                  {/* Font size */}
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Font Size</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">A-</button>
                      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full relative">
                        <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((fontSize - 12) / 20) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-6 text-center">{fontSize}</span>
                      <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">A+</button>
                    </div>
                  </div>

                  {/* Line height */}
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Line Height</label>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setLineHeight(Math.max(1.2, +(lineHeight - 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">-</button>
                      <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full relative">
                        <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((lineHeight - 1.2) / 1.0) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-8 text-center">{lineHeight.toFixed(2)}</span>
                      <button onClick={() => setLineHeight(Math.min(2.2, +(lineHeight + 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">+</button>
                    </div>
                  </div>

                  {/* Font family */}
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Font</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[{ value: 'system-ui', label: 'System' }, { value: "'Literata', 'Source Serif 4', Georgia, serif", label: 'Serif' }, { value: "'Inter', system-ui, sans-serif", label: 'Sans' }, { value: "'Merriweather', Georgia, serif", label: 'Merri' }].map((f) => (
                        <button
                          key={f.label}
                          onClick={() => setFontFamily(f.value)}
                          className={`py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                            fontFamily === f.value
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700'
                              : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme */}
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">Theme</label>
                    <div className="flex gap-1.5">
                      {(['light', 'sepia', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                            theme === t
                              ? t === 'light' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : t === 'dark' ? 'bg-amber-900/50 text-amber-200 ring-1 ring-amber-700' : 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                              : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          {t === 'light' ? 'Light' : t === 'sepia' ? 'Sepia' : 'Dark'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toggles row */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setQuietMode(!quietMode)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        quietMode ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        {quietMode && <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />}
                      </svg>
                      Quiet
                    </button>
                    <button
                      onClick={() => setBgEnabled(!bgEnabled)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        bgEnabled ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      BG
                    </button>
                  </div>

                  {/* Keyboard shortcuts link */}
                  <button
                    onClick={() => { setShowSettingsMenu(false); setShowShortcutsHelp(true); }}
                    className="w-full py-2 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    Keyboard shortcuts (?)
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'md:mr-[360px]' : ''} ${synthesisOpen ? 'md:ml-[400px]' : ''} ${studyMode.enabled ? 'md:mr-[320px]' : ''}`}>
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
            fontFamily={fontFamily}
            lineHeight={lineHeight}
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
        totalPages={book?.totalPages}
        currentPage={book?.currentPage}
        progress={book?.progress}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDeleteAnnotation={handleDeleteAnnotation}
        onUpdateAnnotation={handleUpdateAnnotation}
        onScrollToAnnotation={handleScrollToAnnotation}
      />

      {/* Synthesis panel */}
      <SynthesisPanel
        bookId={bookId}
        bookTitle={book?.title}
        author={book?.author}
        isOpen={synthesisOpen}
        onClose={() => setSynthesisOpen(false)}
      />

      {/* Study mode panel */}
      <div className={`fixed right-0 top-0 bottom-0 z-20 w-80 transition-transform duration-300 ease-out ${studyMode.enabled ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full overflow-y-auto pt-14 px-3 pb-4">
          <StudyModePanel
            enabled={studyMode.enabled}
            loading={studyMode.loading}
            objectives={studyMode.objectives}
            checks={studyMode.checks}
            revealedAnswers={studyMode.revealedAnswers}
            mastery={studyMode.mastery}
            onToggleObjective={studyMode.toggleObjective}
            onRevealAnswer={studyMode.revealAnswer}
            onSaveChecks={studyMode.saveChecks}
          />
        </div>
      </div>

      {/* Companion chat */}
      <CompanionChat
        ref={chatRef}
        bookId={bookId}
        currentPage={currentChapter}
        totalPages={chapters.length}
        bookTitle={book?.title || ''}
        author={book?.author || ''}
        chapterContent={chapterContent}
        genreMetadata={(book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | undefined}
        bookDescription={(book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined}
      />

      {/* Fiction panel — character tracker + mood (only for fiction books) */}
      {!loading && isFiction && chapterContent && (
        <FictionPanel
          chapterContent={chapterContent}
          chapterIndex={currentChapter}
          onAskAboutCharacter={(name) => {
            chatRef.current?.openWithMessage(`Tell me about ${name} — their role, motivations, and how they've developed so far.`);
          }}
        />
      )}

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
          bookId={book.id}
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

      {/* Highlight mode indicator — subtle pill */}
      {highlightMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-md animate-fade-in backdrop-blur-sm">
          Tap text to highlight
        </div>
      )}

      {/* Milestone toast — gentle */}
      {milestone && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="px-4 py-1.5 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-amber-700 dark:text-amber-300 text-xs font-medium shadow-md border border-amber-200/50 dark:border-amber-800/50">
            {milestone} complete
          </div>
        </div>
      )}

      {/* Mobile settings */}
      {showMobileSettings && (
        <MobileSettingsSheet
          fontSize={fontSize}
          theme={theme}
          quietMode={quietMode}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          onFontSizeChange={setFontSize}
          onThemeChange={setTheme}
          onQuietModeChange={setQuietMode}
          onFontFamilyChange={setFontFamily}
          onLineHeightChange={setLineHeight}
          onClose={() => setShowMobileSettings(false)}
        />
      )}

      {/* Shortcuts help button — subtle */}
      <button
        onClick={() => setShowShortcutsHelp(true)}
        className="hidden sm:flex fixed bottom-5 right-5 z-20 w-9 h-9 rounded-full bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:border-amber-300/50 transition-all items-center justify-center"
        aria-label="Keyboard shortcuts help"
      >
        <span className="text-xs font-bold">?</span>
      </button>

      {showShortcutsHelp && <ShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}
    </div>
  );
}
