'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { useTextSelection } from '@/hooks/useTextSelection';
import { useAnnotationHighlights } from '@/hooks/useAnnotationHighlights';
import { useReaderSettings } from '@/hooks/useReaderSettings';
import { useReadingSession } from '@/hooks/useReadingSession';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useStudyMode } from '@/hooks/useStudyMode';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBookContent } from '@/hooks/useBookContent';
import { useAnnotationActions } from '@/hooks/useAnnotationActions';
import { useReaderUI } from '@/hooks/useReaderUI';
import { api } from '@/lib/api';
import { detectGenre, type BookGenre } from '@/lib/companion-prompts';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import { ReaderHeader } from '@/components/reading/ReaderHeader';
import { ReaderSettingsMenu } from '@/components/reading/ReaderSettingsMenu';

// Lazy-load heavy reading components
const ReaderView = dynamic(() => import('@/components/reading/ReaderView').then((m) => ({ default: m.ReaderView })), { ssr: false });
const CompanionChat = dynamic(() => import('@/components/reading/CompanionChat').then((m) => ({ default: m.CompanionChat })), { ssr: false });
const SelectionToolbar = dynamic(() => import('@/components/reading/SelectionToolbar').then((m) => ({ default: m.SelectionToolbar })), { ssr: false });
const AnnotationsSidebar = dynamic(() => import('@/components/reading/AnnotationsSidebar').then((m) => ({ default: m.AnnotationsSidebar })), { ssr: false });
const ReadingBackground = dynamic(() => import('@/components/reading/ReadingBackground').then((m) => ({ default: m.ReadingBackground })), { ssr: false });
const InterventionToast = dynamic(() => import('@/components/reading/InterventionToast').then((m) => ({ default: m.InterventionToast })), { ssr: false });
const SessionSummaryModal = dynamic(() => import('@/components/reading/SessionSummaryModal').then((m) => ({ default: m.SessionSummaryModal })), { ssr: false });
const BookCompletionModal = dynamic(() => import('@/components/reading/BookCompletionModal').then((m) => ({ default: m.BookCompletionModal })), { ssr: false });
const MobileSettingsSheet = dynamic(() => import('@/components/reading/MobileSettingsSheet').then((m) => ({ default: m.MobileSettingsSheet })), { ssr: false });
const SearchOverlay = dynamic(() => import('@/components/reading/SearchOverlay').then((m) => ({ default: m.SearchOverlay })), { ssr: false });
const SynthesisPanel = dynamic(() => import('@/components/reading/SynthesisPanel').then((m) => ({ default: m.SynthesisPanel })), { ssr: false });
const StudyModePanel = dynamic(() => import('@/components/reading/StudyModePanel').then((m) => ({ default: m.StudyModePanel })), { ssr: false });
const FictionPanel = dynamic(() => import('@/components/reading/FictionPanel').then((m) => ({ default: m.FictionPanel })), { ssr: false });
const ChapterTimeline = dynamic(() => import('@/components/reading/ChapterTimeline').then((m) => ({ default: m.ChapterTimeline })), { ssr: false });
const FeatureTour = dynamic(() => import('@/components/reading/FeatureTour').then((m) => ({ default: m.FeatureTour })), { ssr: false });

const THEME_CLASSES = {
  light: 'bg-[#fefdfb] text-gray-900',
  dark: 'bg-[#0f1419] text-gray-100',
  sepia: 'bg-[#f8f4ec] text-amber-900',
} as const;

/** Selection hint for new readers. */
function SelectionHint({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations('reader');
  const [isReturningUser, setIsReturningUser] = useState(false);

  useEffect(() => {
    const returning = localStorage.getItem('read-pal-selection-used') === 'true';
    setIsReturningUser(returning);
    if (returning) {
      const t = setTimeout(onDismiss, 3000);
      return () => clearTimeout(t);
    }
  }, [onDismiss]);

  return (
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 animate-fade-in" style={{ animation: 'fade-in 0.5s 1.5s forwards' }}>
      <div className={`px-4 py-2 rounded-xl text-white text-sm backdrop-blur-sm shadow-lg flex items-center gap-2 pointer-events-auto ${
        isReturningUser ? 'bg-amber-600/60' : 'bg-amber-600/80'
      }`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span>{isReturningUser ? t('selection_hint_tip') : t('selection_hint_new')}</span>
        <button onClick={onDismiss} className="ml-1 opacity-60 hover:opacity-100 transition-opacity" aria-label={t('dismiss_label')}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Nudge for new users to discover AI companion. */
function CompanionNudge() {
  const t = useTranslations('reader');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const tourDone = localStorage.getItem('read-pal-tour-complete') === 'true';
    const chatOpened = localStorage.getItem('read-pal-chat-opened') === 'true';
    const nudgeDismissed = localStorage.getItem('read-pal-companion-nudge') === 'true';
    if (tourDone && !chatOpened && !nudgeDismissed) {
      const timer = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem('read-pal-companion-nudge', 'true'); } catch { /* ignore */ }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 right-6 z-10 animate-fade-in max-w-[220px]">
      <div className="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/30 dark:to-emerald-900/30 rounded-xl border border-teal-200/60 dark:border-teal-800/40 p-3 shadow-lg">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-teal-800 dark:text-teal-200">{t('companion_nudge_title')}</p>
            <p className="text-[10px] text-teal-600/70 dark:text-teal-400/60 mt-0.5">{t('companion_nudge_desc')}</p>
          </div>
          <button onClick={handleDismiss} className="text-teal-400 hover:text-teal-600 dark:hover:text-teal-300 transition-colors flex-shrink-0 -mt-0.5" aria-label={t('dismiss_label')}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keyboard shortcuts help modal. */
function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const t = useTranslations('reader');
  const shortcuts = [
    { keys: ['\u2190', '\u2192'], label: t('shortcut_prev_next') },
    { keys: ['H'], label: t('shortcut_highlight') },
    { keys: ['B'], label: t('shortcut_bookmark') },
    { keys: ['T'], label: t('shortcut_toc') },
    { keys: ['Esc'], label: t('shortcut_close') },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in" onClick={onClose} tabIndex={-1} role="button" aria-label={t('close_dialog')}>
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{t('keyboard_shortcuts_title')}</h3>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors" aria-label={t('close_label')}>
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
                  <kbd key={k} className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-gray-500 dark:text-gray-400 text-center">{t('swipe_hint')}</p>
      </div>
    </div>
  );
}

export default function ReadPage() {
  const t = useTranslations('reader');
  usePageTitle(t('page_title'));
  const params = useParams();
  const router = useRouter();
  const bookId = (params?.bookId ?? '') as string;
  const { toast } = useToast();

  // --- Extracted hooks ---
  const {
    book, chapters, currentChapter, annotations, loading, error,
    chapterContent, chapterTitle, setCurrentChapter, setAnnotations,
    setChapterFade, chapterFade,
  } = useBookContent(bookId, t('failed_load_book'), t('failed_load_book'), t('failed_connect'));

  const ui = useReaderUI();

  const contentRef = useRef<HTMLElement | null>(null);
  const chatRef = useRef<CompanionChatHandle>(null);

  // Keep contentRef synced with the article element rendered by ReaderView.
  // dynamic() breaks ref propagation, so we use a MutationObserver + polling fallback.
  useEffect(() => {
    const sync = () => {
      const article = document.querySelector('article.reading-mode');
      if (article && contentRef.current !== article) {
        (contentRef as React.MutableRefObject<HTMLElement | null>).current = article as HTMLElement;
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = setInterval(sync, 2000);
    return () => { observer.disconnect(); clearInterval(interval); };
  }, []);

  const selection = useTextSelection(contentRef);

  const { fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode, fontFamily, setFontFamily, lineHeight, setLineHeight } = useReaderSettings(bookId, loading);
  const { sessionIdRef } = useReadingSession({ bookId, loading, currentChapter, chaptersLength: chapters.length, isPaused: ui.isPaused });
  const studyMode = useStudyMode(bookId);

  const annotationActions = useAnnotationActions({
    bookId, currentChapter, chapters, contentRef, selectionRange: selection.range,
    annotations, setAnnotations,
    toastError: (msg: string) => toast(msg, 'error'),
    toast: {
      failed_load_annotations: t('failed_load_annotations'),
      failed_save_highlight: t('failed_save_highlight'),
      failed_save_note: t('failed_save_note'),
      failed_remove_bookmark: t('failed_remove_bookmark'),
      failed_add_bookmark: t('failed_add_bookmark'),
      failed_delete_annotation: t('failed_delete_annotation'),
      failed_save_progress: t('failed_save_progress'),
    },
  });

  // Reading speed
  const [readingWpm, setReadingWpm] = useState<number | null>(null);
  useEffect(() => {
    if (loading) return;
    api.get<{ currentWpm: number; trend: string }>('/api/stats/reading-speed')
      .then((res) => { if (res.success && res.data && res.data.currentWpm > 0) setReadingWpm(res.data.currentWpm); });
  }, [loading]);

  // Selection tracking
  const [hasMadeSelection, setHasMadeSelection] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('read-pal-selection-used') === 'true';
  });
  const [highlightMode, setHighlightMode] = useState(false);
  const [bgEnabled, setBgEnabled] = useState(true);
  const [sessionSummary, setSessionSummary] = useState<{ duration: number; chaptersRead: number; sessionId?: string } | null>(null);

  useEffect(() => {
    if (!selection.isCollapsed && !hasMadeSelection) {
      setHasMadeSelection(true);
      try { localStorage.setItem('read-pal-selection-used', 'true'); } catch { /* ignore */ }
    }
  }, [selection.isCollapsed, hasMadeSelection]);

  useEffect(() => {
    if (highlightMode && !selection.isCollapsed && selection.text) {
      annotationActions.handleAddHighlight(selection.text, 'amber');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMode, selection.isCollapsed]);

  // Chapter navigation
  const handleChapterChange = useCallback(async (chapterIndex: number) => {
    if (chapterIndex === currentChapter || chapterIndex < 0 || chapterIndex >= chapters.length) return;
    setChapterFade('out');
    await new Promise<void>((r) => setTimeout(r, 150));
    setCurrentChapter(chapterIndex);
    setChapterFade('in');
    try {
      await api.patch(`/api/books/${bookId}`, { current_page: chapterIndex });
    } catch (err) {
      console.error('Failed to update progress:', err);
      toast(t('failed_save_progress'), 'error');
    }
  }, [currentChapter, chapters.length, bookId, setChapterFade, setCurrentChapter, toast, t]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    currentChapter, chaptersLength: chapters.length, sidebarOpen: ui.sidebarOpen,
    showShortcutsHelp: ui.showShortcutsHelp, showMobileSettings: ui.showMobileSettings,
    tocOpen: ui.tocOpen, synthesisOpen: ui.synthesisOpen,
    onChapterChange: handleChapterChange,
    onToggleBookmark: annotationActions.handleToggleBookmark,
    onSetHighlightMode: setHighlightMode,
    onSetTocOpen: ui.setTocOpen,
    onSetShowShortcutsHelp: ui.setShowShortcutsHelp,
    onSetSidebarOpen: ui.setSidebarOpen,
    onSetShowMobileSettings: ui.setShowMobileSettings,
    onSetSynthesisOpen: ui.setSynthesisOpen,
  });

  useAnnotationHighlights(contentRef, annotations, currentChapter, theme);

  // Study mode data loading
  useEffect(() => {
    if (!loading && chapters.length > 0 && studyMode.enabled) {
      const ch = chapters[currentChapter];
      const content = ch?.rawContent || ch?.content || '';
      studyMode.loadChapterStudy(currentChapter, ch?.title || '', content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, loading, chapters.length, studyMode.enabled]);

  // Book completion detection — only when on last chapter AND progress >= 95%
  useEffect(() => {
    if (!loading && chapters.length > 1 && currentChapter === chapters.length - 1 && (book?.progress ?? 0) >= 0.95) {
      // Dismiss onboarding tour if still running — completion modal takes priority
      try {
        localStorage.setItem('read-pal-tour-complete', 'true');
        localStorage.removeItem('read-pal-tour-step');
      } catch { /* ignore */ }
      const timer = setTimeout(() => ui.setShowCompletion(true), 3000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, chapters.length, loading, book?.progress]);

  // Milestone detection
  const shownMilestones = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (loading || chapters.length === 0) return;
    const pct = ((currentChapter + 1) / chapters.length) * 100;
    for (const m of [25, 50, 75]) {
      if (pct >= m && !shownMilestones.current.has(m)) {
        shownMilestones.current.add(m);
        ui.setMilestone(`${m}%`);
        const timer = setTimeout(() => ui.setMilestone(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapter, chapters.length, loading]);

  // Genre detection
  const bookGenre: BookGenre = detectGenre(
    (book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined,
    book?.title,
    (book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined,
  );
  const isFiction = bookGenre === 'fiction';

  const chapterTitles = useMemo(() => chapters.map((ch) => ({ title: ch.title })), [chapters]);

  // Back button
  const sessionStartRef = useRef<number>(Date.now());
  const handleBack = useCallback(() => {
    const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
    if (elapsed > 30) {
      setSessionSummary({ duration: elapsed, chaptersRead: currentChapter + 1, sessionId: sessionIdRef.current || undefined });
    } else {
      router.push('/library');
    }
  }, [currentChapter, router, sessionIdRef]);

  // --- Render ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#fefdfb]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !book || chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold mb-4">{error || t('unable_to_load')}</p>
          <a href="/library" className="btn btn-primary">{t('back_to_library')}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col relative overflow-x-hidden">
      <ReadingBackground content={chapterContent} enabled={bgEnabled} />

      <ReaderHeader
        bookTitle={book.title}
        author={book.author}
        currentChapter={currentChapter}
        totalChapters={chapters.length}
        readingWpm={readingWpm}
        isPaused={ui.isPaused}
        isBookmarked={annotationActions.isBookmarked}
        annotationsCount={annotations.length}
        theme={theme}
        searchOpen={ui.searchOpen}
        sidebarOpen={ui.sidebarOpen}
        synthesisOpen={ui.synthesisOpen}
        studyModeEnabled={studyMode.enabled}
        onBack={handleBack}
        onToggleBookmark={annotationActions.handleToggleBookmark}
        onToggleSearch={() => ui.setSearchOpen(!ui.searchOpen)}
        onToggleSidebar={() => ui.setSidebarOpen(!ui.sidebarOpen)}
        onToggleSynthesis={() => ui.setSynthesisOpen(!ui.synthesisOpen)}
        onToggleStudyMode={studyMode.toggleStudyMode}
        onShowTimeline={() => ui.setShowTimeline(true)}
        onShowSettings={() => {
          if (window.innerWidth < 640) {
            ui.setShowMobileSettings(true);
          } else {
            ui.setShowSettingsMenu(!ui.showSettingsMenu);
          }
        }}
        settingsMenu={
          <ReaderSettingsMenu
            show={ui.showSettingsMenu}
            theme={theme}
            fontSize={fontSize}
            lineHeight={lineHeight}
            fontFamily={fontFamily}
            quietMode={quietMode}
            bgEnabled={bgEnabled}
            onClose={() => ui.setShowSettingsMenu(false)}
            onFontSizeChange={setFontSize}
            onLineHeightChange={setLineHeight}
            onFontFamilyChange={setFontFamily}
            onThemeChange={setTheme}
            onQuietModeChange={setQuietMode}
            onBgEnabledChange={setBgEnabled}
            onShowShortcuts={() => ui.setShowShortcutsHelp(true)}
          />
        }
      />

      {/* Search */}
      {ui.searchOpen && (
        <SearchOverlay
          searchQuery={ui.searchQuery}
          onQueryChange={ui.setSearchQuery}
          currentChapter={currentChapter}
          chapters={chapters}
          onNavigate={(idx) => handleChapterChange(idx)}
          onClose={() => ui.setSearchOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className={`h-full ${THEME_CLASSES[theme]} ${chapterFade === 'out' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}>
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
            showControls={ui.showControls}
            onToggleControls={ui.handleToggleControls}
            highlightMode={highlightMode}
            highlightCount={annotationActions.highlightCount}
            bookmarkCount={annotationActions.bookmarkCount}
            externalTocOpen={ui.tocOpen}
            onTocClose={ui.closeToc}
          />
        </div>
      </div>

      {!hasMadeSelection && <SelectionHint onDismiss={() => setHasMadeSelection(true)} />}
      <CompanionNudge />
      <FeatureTour />

      {/* Selection toolbar */}
      {!selection.isCollapsed && selection.rect && (
        <SelectionToolbar
          text={selection.text}
          rect={selection.rect}
          range={selection.range}
          bookTitle={book?.title}
          author={book?.author}
          onHighlight={annotationActions.handleAddHighlight}
          onNote={annotationActions.handleAddNote}
          onDismiss={annotationActions.dismissSelection}
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
        isOpen={ui.sidebarOpen}
        onClose={() => ui.setSidebarOpen(false)}
        onDeleteAnnotation={annotationActions.handleDeleteAnnotation}
        onUpdateAnnotation={annotationActions.handleUpdateAnnotation}
        onScrollToAnnotation={annotationActions.handleScrollToAnnotation}
      />

      {/* Synthesis panel */}
      <SynthesisPanel bookId={bookId} bookTitle={book?.title} author={book?.author} isOpen={ui.synthesisOpen} onClose={() => ui.setSynthesisOpen(false)} />

      {/* Study mode */}
      {studyMode.enabled && (
        <div className="fixed inset-0 z-20 bg-black/40 md:bg-black/20" onClick={studyMode.toggleStudyMode} />
      )}
      <div className={`fixed right-0 top-0 bottom-0 z-20 w-full md:w-80 transition-transform duration-300 ease-out ${studyMode.enabled ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full overflow-y-auto px-3 pb-4 bg-white dark:bg-gray-900 md:bg-transparent">
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
        genreMetadata={(book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined}
        bookDescription={(book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined}
      />

      {/* Fiction panel */}
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
          highlightCount={annotationActions.totalHighlights}
        />
      )}

      {/* Book completion */}
      {ui.showCompletion && book && (
        <BookCompletionModal
          bookId={book.id}
          bookTitle={book.title}
          totalHighlights={annotationActions.totalHighlights}
          totalNotes={annotationActions.totalNotes}
          totalChapters={chapters.length}
          onClose={() => ui.setShowCompletion(false)}
        />
      )}

      {/* Session summary */}
      {sessionSummary && (
        <SessionSummaryModal
          duration={sessionSummary.duration}
          chaptersRead={sessionSummary.chaptersRead}
          totalChapters={chapters.length}
          sessionId={sessionSummary.sessionId}
          onKeepReading={() => setSessionSummary(null)}
          onBackToLibrary={() => { setSessionSummary(null); router.push('/library'); }}
        />
      )}

      {/* Highlight mode indicator */}
      {highlightMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-md animate-fade-in backdrop-blur-sm">
          {t('tap_to_highlight')}
        </div>
      )}

      {/* Milestone toast */}
      {ui.milestone && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
          <div className="px-4 py-1.5 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-amber-700 dark:text-amber-300 text-xs font-medium shadow-md border border-amber-200/50 dark:border-amber-800/50">
            {ui.milestone} {t('milestone_complete')}
          </div>
        </div>
      )}

      {/* Mobile settings */}
      {ui.showMobileSettings && (
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
          onClose={() => ui.setShowMobileSettings(false)}
        />
      )}

      {/* Shortcuts help button */}
      <button
        onClick={() => ui.setShowShortcutsHelp(true)}
        className="hidden sm:flex fixed bottom-5 right-20 z-10 w-9 h-9 rounded-full bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:border-amber-300/50 transition-all items-center justify-center"
        aria-label={t('keyboard_shortcuts_help')}
      >
        <span className="text-xs font-bold">?</span>
      </button>

      {ui.showShortcutsHelp && <ShortcutsHelp onClose={() => ui.setShowShortcutsHelp(false)} />}

      {ui.showTimeline && book && (
        <ChapterTimeline
          bookId={book.id}
          totalChapters={chapters.length}
          currentChapter={currentChapter}
          chapterTitles={chapterTitles}
          onChapterSelect={(i) => { setCurrentChapter(i); ui.setShowTimeline(false); }}
          onClose={() => ui.setShowTimeline(false)}
        />
      )}
    </div>
  );
}
