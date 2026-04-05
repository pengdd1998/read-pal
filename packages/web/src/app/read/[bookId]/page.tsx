'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { ReaderView } from '@/components/reading/ReaderView';
import { SelectionToolbar } from '@/components/reading/SelectionToolbar';
import { AnnotationsSidebar } from '@/components/reading/AnnotationsSidebar';
import { BookmarkToggle } from '@/components/reading/BookmarkToggle';
import { CompanionChat } from '@/components/reading/CompanionChat';
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
      <div className="px-3 py-1.5 rounded-full bg-gray-500/60 text-white text-xs backdrop-blur-sm">
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

  const contentRef = useRef<HTMLElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selection = useTextSelection(contentRef);

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
                pagesRead: currentChapter + 1,
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
        api.post(`/api/reading-sessions/${sid}/end`, {
          pagesRead: currentChapter + 1,
          currentPage: currentChapter,
          totalPages: chapters.length,
        }).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [bookId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
      (mark as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
      setTimeout(() => {
        (mark as HTMLElement).style.backgroundColor = original;
      }, 1500);
    }
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    sepia: 'bg-amber-50 text-amber-900',
  };

  const headerBgClasses = {
    light: 'bg-white/90 border-gray-200',
    dark: 'bg-gray-900/90 border-gray-700',
    sepia: 'bg-amber-50/90 border-amber-200',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
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

      {/* Top bar — slides in/out with controls */}
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
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-xl text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Back to library"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>

          <div className="min-w-0">
            <h1 className="text-sm font-medium truncate">{book.title}</h1>
            {book.author && (
              <p className="text-xs text-gray-400 truncate">{book.author}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Font Size Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <span className="text-xs text-gray-400 min-w-[2rem] text-center">{fontSize}</span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              className="px-2 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Theme Toggle */}
          <div className="hidden sm:flex gap-0.5">
            {(['light', 'sepia', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                  theme === t
                    ? t === 'light' ? 'bg-gray-200 text-gray-800' : t === 'dark' ? 'bg-gray-700 text-gray-100' : 'bg-amber-200 text-amber-900'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                aria-label={`${t} theme`}
              >
                {t === 'light' ? '\u2600\uFE0F' : t === 'sepia' ? '\uD83D\uDCD6' : '\uD83C\uDF19'}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

          {/* Background toggle */}
          <button
            onClick={() => setBgEnabled(!bgEnabled)}
            className="p-2 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={bgEnabled ? 'Disable dynamic background' : 'Enable dynamic background'}
          >
            {bgEnabled ? 'BG On' : 'BG Off'}
          </button>

          {/* Bookmark toggle */}
          <BookmarkToggle
            isBookmarked={isBookmarked}
            onToggle={handleToggleBookmark}
          />

          {/* Annotations badge button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sidebarOpen
                ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            aria-label="Toggle annotations sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {annotations.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs font-semibold">
                {annotations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main content area - takes remaining space */}
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${sidebarOpen ? 'md:mr-[360px]' : ''}`}>
        <div className={`h-full ${themeClasses[theme]} transition-colors duration-200`}>
          <ReaderView
            bookId={bookId}
            chapterContent={chapterContent}
            chapterTitle={chapters[currentChapter]?.title || book.title}
            currentPage={currentChapter}
            totalPages={chapters.length || 1}
            onPageChange={handleChapterChange}
            contentRef={contentRef}
            fontSize={fontSize}
            theme={theme}
            onThemeChange={setTheme}
            onFontSizeChange={setFontSize}
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
        />
      )}

      {/* Annotations sidebar */}
      <AnnotationsSidebar
        annotations={annotations}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onDeleteAnnotation={handleDeleteAnnotation}
        onScrollToAnnotation={handleScrollToAnnotation}
      />

      {/* Companion chat */}
      <CompanionChat
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
