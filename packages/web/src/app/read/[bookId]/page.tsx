'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { ReaderView } from '@/components/reading/ReaderView';
import { SelectionToolbar } from '@/components/reading/SelectionToolbar';
import { AnnotationsSidebar } from '@/components/reading/AnnotationsSidebar';
import { BookmarkToggle } from '@/components/reading/BookmarkToggle';
import { CompanionChat, type CompanionChatHandle } from '@/components/reading/CompanionChat';
import { ReadingBackground } from '@/components/reading/ReadingBackground';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useAnnotationHighlights } from '@/hooks/useAnnotationHighlights';
import { api } from '@/lib/api';
import type { Book, Chapter, Annotation } from '@read-pal/shared';

const SETTINGS_KEY_PREFIX = 'reader-settings';

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

function loadReaderSettings(bookId: string) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY_PREFIX}-${bookId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveReaderSettings(bookId: string, settings: { fontSize: number; theme: string }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${SETTINGS_KEY_PREFIX}-${bookId}`, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/**
 * Compute character offsets for a DOM Range relative to a container element.
 */
function computeOffsets(
  range: Range,
  container: HTMLElement,
): { start: number; end: number } {
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  return { start, end };
}

export default function ReadPage() {
  const params = useParams();
  const bookId = params.bookId as string;

  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bgEnabled, setBgEnabled] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [fontSize, setFontSize] = useState(18);
  const [hasMadeSelection, setHasMadeSelection] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const contentRef = useRef<HTMLElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChapterRef = useRef(currentChapter);
  const chatRef = useRef<CompanionChatHandle>(null);
  const selection = useTextSelection(contentRef);

  // Keep ref in sync so heartbeat always sends the latest chapter
  useEffect(() => {
    currentChapterRef.current = currentChapter;
  }, [currentChapter]);

  // Derive current chapter content from chapters array
  const chapterContent = chapters[currentChapter]?.content || '';
  const chapterTitle = chapters[currentChapter]?.title || book?.title || '';

  // --- Settings persistence ---
  useEffect(() => {
    const saved = loadReaderSettings(bookId);
    if (saved) {
      if (typeof saved.fontSize === 'number') setFontSize(saved.fontSize);
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'sepia') {
        setTheme(saved.theme);
      }
    }
  }, [bookId]);

  useEffect(() => {
    if (!loading) {
      saveReaderSettings(bookId, { fontSize, theme });
    }
  }, [bookId, fontSize, theme, loading]);

  // Track when user makes first selection
  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) {
      setHasMadeSelection(true);
    }
  }, [selection.isCollapsed, hasMadeSelection]);

  // --- Escape key to close sidebar ---
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [sidebarOpen]);

  // Start/end reading session lifecycle
  useEffect(() => {
    if (!bookId || loading) return;

    let cancelled = false;

    const startSession = async () => {
      try {
        const result = await api.post<{ id: string }>('/api/reading-sessions/start', { bookId });
        if (result.success && result.data && !cancelled) {
          const data = result.data as unknown as { id: string };
          sessionIdRef.current = data.id;

          // Heartbeat every 30s to keep session alive and track progress
          heartbeatRef.current = setInterval(async () => {
            if (!sessionIdRef.current) return;
            try {
              await api.patch(`/api/reading-sessions/${sessionIdRef.current}/heartbeat`, {
                pagesRead: currentChapterRef.current + 1,
              });
            } catch {
              // heartbeat failure is non-critical
            }
          }, 30_000);
        }
      } catch (err) {
        console.error('Failed to start reading session:', err);
      }
    };

    startSession();

    return () => {
      cancelled = true;
      // End session on unmount
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (sessionIdRef.current) {
        const sid = sessionIdRef.current;
        const finalChapter = currentChapterRef.current;
        api.post(`/api/reading-sessions/${sid}/end`, {
          pagesRead: finalChapter + 1,
          currentPage: finalChapter,
          totalPages: chapters.length,
        }).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading]);

  // Render annotation highlights in the content
  useAnnotationHighlights(contentRef, annotations, currentChapter, theme);

  const loadAnnotations = useCallback(async () => {
    try {
      const result = await api.get<Annotation[]>('/api/annotations', { bookId });
      if (result.success && result.data) {
        const data = result.data as unknown as Annotation[];
        setAnnotations(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
    }
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;

    const loadBookContent = async () => {
      try {
        setLoading(true);

        const result = await api.get<{
          book: Book;
          chapters: Chapter[];
          content: string;
        }>(`/api/upload/books/${bookId}/content`);

        if (cancelled) return;

        if (result.success && result.data) {
          const data = result.data as unknown as {
            book: Book;
            chapters: Chapter[];
            content: string;
          };
          setBook(data.book);
          setChapters(data.chapters ?? []);
          setCurrentChapter(data.book.currentPage || 0);

          // Load annotations
          loadAnnotations();
        } else {
          setError(result.error?.message || 'Failed to load book');
        }
      } catch {
        if (!cancelled) setError('Failed to connect to server');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBookContent();
    return () => { cancelled = true; };
  }, [bookId, loadAnnotations]);

  const handleChapterChange = async (chapterIndex: number) => {
    setCurrentChapter(chapterIndex);

    try {
      await api.patch(`/api/books/${bookId}`, { currentPage: chapterIndex });
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  };

  const dismissSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }, []);

  const handleAddHighlight = async (text: string, color: string) => {
    try {
      const chapter = chapters[currentChapter];
      const offsets =
        selection.range && contentRef.current
          ? computeOffsets(selection.range, contentRef.current)
          : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId,
        type: 'highlight',
        content: text,
        color,
        location: {
          chapterId: chapter.id,
          pageIndex: currentChapter,
          position: 0,
          selection: offsets,
        },
      });

      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data as unknown as Annotation]);
      }
    } catch (err) {
      console.error('Failed to add highlight:', err);
    }

    dismissSelection();
  };

  const handleAddNote = async (text: string, note: string) => {
    try {
      const chapter = chapters[currentChapter];
      const offsets =
        selection.range && contentRef.current
          ? computeOffsets(selection.range, contentRef.current)
          : { start: 0, end: text.length };

      const result = await api.post<Annotation>('/api/annotations', {
        bookId,
        type: 'note',
        content: text,
        note,
        location: {
          chapterId: chapter.id,
          pageIndex: currentChapter,
          position: 0,
          selection: offsets,
        },
      });

      if (result.success && result.data) {
        setAnnotations((prev) => [...prev, result.data as unknown as Annotation]);
      }
    } catch (err) {
      console.error('Failed to add note:', err);
    }

    dismissSelection();
  };

  // Bookmark state
  const isBookmarked = annotations.some(
    (a) => a.type === 'bookmark' && a.location?.pageIndex === currentChapter,
  );

  const handleToggleBookmark = async () => {
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
          bookId,
          type: 'bookmark',
          content: `Bookmark: ${chapter.title}`,
          location: {
            chapterId: chapter.id,
            pageIndex: currentChapter,
            position: 0,
            selection: { start: 0, end: 0 },
          },
        });

        if (result.success && result.data) {
          setAnnotations((prev) => [...prev, result.data as unknown as Annotation]);
        }
      } catch (err) {
        console.error('Failed to add bookmark:', err);
      }
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await api.delete(`/api/annotations/${id}`);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  const handleScrollToAnnotation = useCallback((annotation: Annotation) => {
    const mark = contentRef.current?.querySelector(
      `[data-annotation-id="${annotation.id}"]`,
    );
    if (mark) {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const original = (mark as HTMLElement).style.backgroundColor;
      (mark as HTMLElement).style.backgroundColor = 'rgba(217, 119, 6, 0.5)'; // Warm amber highlight
      setTimeout(() => {
        (mark as HTMLElement).style.backgroundColor = original;
      }, 1500);
    }
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  // Warm bookish design - paper backgrounds
  const themeClasses = {
    light: 'bg-[#fefdfb] text-gray-900',
    dark: 'bg-[#0f1419] text-gray-100',
    sepia: 'bg-[#f8f4ec] text-amber-900',
  };

  // Warm cream tones for headers
  const headerBgClasses = {
    light: 'bg-[#fdfbf7]/95 border-amber-200/50',
    dark: 'bg-[#1a1f26]/95 border-amber-900/30',
    sepia: 'bg-[#f5f0e6]/95 border-amber-300/50',
  };

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
          <p className="text-xl font-semibold mb-4">
            {error || 'Unable to load book'}
          </p>
          <a href="/library" className="btn btn-primary">
            Back to Library
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Dynamic AI-generated reading background */}
      <ReadingBackground
        content={chapterContent}
        enabled={bgEnabled}
      />

      {/* Top bar — slides in/out with controls - warm bookish design */}
      <div
        className={`relative z-10 flex items-center justify-between px-3 py-2 border-b backdrop-blur-sm ${headerBgClasses[theme]} transition-all duration-300 ease-out ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ height: showControls ? undefined : 0, overflow: 'hidden' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Back arrow - only navigation button */}
          <a
            href="/library"
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
            aria-label="Back to library"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>

          <div className="min-w-0">
            <h1 className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">{book.title}</h1>
            {book.author && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{book.author}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mobile-only compact settings row — font size + theme cycle */}
          <div className="flex sm:hidden items-center gap-0.5">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="flex items-center justify-center w-11 h-11 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors active:scale-95"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 min-w-[1.5rem] text-center font-medium select-none">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              className="flex items-center justify-center w-11 h-11 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors active:scale-95"
              aria-label="Increase font size"
            >
              A+
            </button>
            <div className="w-px h-5 bg-amber-200/50 dark:bg-amber-900/30 mx-0.5" />
            <button
              onClick={() => {
                const themes: ('light' | 'sepia' | 'dark')[] = ['light', 'sepia', 'dark'];
                const nextIndex = (themes.indexOf(theme) + 1) % themes.length;
                setTheme(themes[nextIndex]);
              }}
              className="flex items-center justify-center w-11 h-11 rounded-lg text-sm transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-900/30 active:scale-95"
              aria-label={`Current theme: ${theme}. Tap to change.`}
            >
              {theme === 'light' ? '\u2600\uFE0F' : theme === 'sepia' ? '\uD83D\uDCD6' : '\uD83C\uDF19'}
            </button>
          </div>

          {/* Desktop Font Size Controls - warm amber accent */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-xs text-amber-600 dark:text-amber-400 min-w-[2rem] text-center font-medium">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Desktop Theme Toggle - warm amber highlight for active state */}
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

          {/* In-book search */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`p-2 rounded-lg text-sm transition-colors ${
              searchOpen
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'
            }`}
            aria-label="Search in book"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          {/* Background toggle */}
          <button
            onClick={() => setBgEnabled(!bgEnabled)}
            className="p-2 rounded-lg text-xs font-medium text-gray-500 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
            title={bgEnabled ? 'Disable dynamic background' : 'Enable dynamic background'}
          >
            {bgEnabled ? 'BG On' : 'BG Off'}
          </button>

          {/* Bookmark toggle */}
          <BookmarkToggle
            isBookmarked={isBookmarked}
            onToggle={handleToggleBookmark}
          />

          {/* Annotations badge button - warm amber accent */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sidebarOpen
                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                : 'text-gray-600 dark:text-gray-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300'
            }`}
            aria-label="Toggle annotations sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {annotations.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                {annotations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* In-book search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-fade-in" onClick={() => setSearchOpen(false)}>
          <div
            className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-lg px-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in this book..."
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                  autoFocus
                />
                <span className="text-xs text-gray-400">
                  {searchQuery.trim().length >= 2
                    ? `${chapters.filter((ch) => {
                        const q = searchQuery.toLowerCase();
                        return (
                          (ch.title || '').toLowerCase().includes(q) ||
                          (ch.content || '').toLowerCase().includes(q)
                        );
                      }).length} chapters`
                    : ''}
                </span>
                <button
                  onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {searchQuery.trim().length >= 2 && (
                <div className="max-h-64 overflow-y-auto border-t border-gray-100 dark:border-gray-800">
                  {(() => {
                    const q = searchQuery.toLowerCase();
                    const results = chapters
                      .map((ch, i) => {
                        const titleMatch = (ch.title || '').toLowerCase().includes(q);
                        const contentLower = (ch.content || '').toLowerCase();
                        const contentMatch = contentLower.includes(q);
                        if (!titleMatch && !contentMatch) return null;

                        // Extract snippet around first match
                        let snippet = '';
                        if (contentMatch) {
                          const idx = contentLower.indexOf(q);
                          const start = Math.max(0, idx - 40);
                          const end = Math.min(ch.content!.length, idx + q.length + 40);
                          snippet = (start > 0 ? '...' : '') +
                            ch.content!.slice(start, end) +
                            (end < ch.content!.length ? '...' : '');
                        }

                        return { index: i, title: ch.title || `Chapter ${i + 1}`, snippet, titleMatch };
                      })
                      .filter(Boolean) as { index: number; title: string; snippet: string; titleMatch: boolean }[];

                    return results.length > 0 ? (
                      results.map((r) => (
                        <button
                          key={r.index}
                          onClick={() => {
                            setCurrentChapter(r.index);
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors ${
                            r.index === currentChapter ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-500 font-mono font-bold">{r.index + 1}</span>
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {r.title}
                            </span>
                            {r.index === currentChapter && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full font-medium">
                                Current
                              </span>
                            )}
                          </div>
                          {r.snippet && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed pl-5">
                              {r.snippet}
                            </p>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-gray-400">
                        No results for &ldquo;{searchQuery}&rdquo;
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content area - takes remaining space */}
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'md:mr-[360px]' : ''}`}>
        <div className={`h-full ${themeClasses[theme]} transition-colors duration-200`}>
          <ReaderView
            bookId={bookId}
            chapterContent={chapterContent}
            chapterTitle={chapters[currentChapter]?.title || book.title}
            currentPage={currentChapter}
            totalPages={chapters.length || 1}
            chapters={chapters.map((ch) => ({ title: ch.title }))}
            onPageChange={handleChapterChange}
            contentRef={contentRef}
            fontSize={fontSize}
            theme={theme}
            showControls={showControls}
            onToggleControls={() => setShowControls((v) => !v)}
          />
        </div>
      </div>

      {/* Selection hint — subtle, auto-hides after 6 seconds or first selection */}
      {!hasMadeSelection && (
        <SelectionHint onDismiss={() => setHasMadeSelection(true)} />
      )}

      {/* Selection toolbar - appears on text selection */}
      {!selection.isCollapsed && selection.rect && (
        <SelectionToolbar
          text={selection.text}
          rect={selection.rect}
          range={selection.range}
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
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDeleteAnnotation={handleDeleteAnnotation}
        onUpdateAnnotation={(updated) => {
          setAnnotations((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a)),
          );
        }}
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
    </div>
  );
}
