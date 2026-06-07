'use client';

import { useEffect, useCallback } from 'react';
import { useReaderPage } from '@/hooks/useReaderPage';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import { pageThemeClasses, type ReaderTheme } from '@/lib/reader-theme';
import { SelectionHint } from '@/components/reading/SelectionHint';
import { CompanionNudge } from '@/components/reading/CompanionNudge';
import { ShortcutsHelp } from '@/components/reading/ShortcutsHelp';
import { ReaderHeader } from '@/components/reading/ReaderHeader';
import { ReaderSettingsMenu } from '@/components/reading/ReaderSettingsMenu';
import { Link } from '@/i18n/navigation';
import {
 ReaderView, CompanionChatDynamic, SelectionToolbar, AnnotationsSidebar,
 ReadingBackground, InterventionToast, SessionSummaryModal, BookCompletionModal,
 MobileSettingsSheet, SearchOverlay, SynthesisPanel, ReadingPlanPanel,
 StudyModePanel, FictionPanel, ChapterTimeline, FeatureTour,
} from '@/components/reading/ReaderDynamicImports';

export default function ReadPage() {
 const {
 bookId, t, router,
 book, chapters, currentChapter, annotations, loading, error,
 chapterContent, chapterTitle, chapterFade,
 currentSegment, totalSegments, pageContent,
 contentRef, chatHandleRef,
 fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode,
 fontFamily, setFontFamily, lineHeight, setLineHeight,
 bgEnabled, setBgEnabled, highlightMode, setHighlightMode,
 readingWpm, hasMadeSelection, setHasMadeSelection,
 sessionSummary, setSessionSummary, sessionIdRef,
 chapterScrollProgress, setChapterScrollProgress, isFiction, chapterTitles, genreMetadata, bookDescription,
 ui, handleChapterChange, handleBack, handleShowSettings,
 handleToggleStudyMode, handleBackToLibrary,
 setCurrentChapter, setCurrentSegment,
 annotationActions, selection, studyMode,
 } = useReaderPage();

 // --- Stable callbacks to prevent child re-renders on scroll progress updates ---
 const handleToggleSearch = useCallback(() => ui.setSearchOpen((v) => !v), [ui.setSearchOpen]);
 const handleToggleSidebar = useCallback(() => ui.setSidebarOpen((v) => !v), [ui.setSidebarOpen]);
 const handleToggleSynthesis = useCallback(() => ui.setSynthesisOpen((v) => !v), [ui.setSynthesisOpen]);
 const handleToggleReadingPlan = useCallback(() => ui.setReadingPlanOpen((v) => !v), [ui.setReadingPlanOpen]);
 const handleShowTimelineCb = useCallback(() => ui.setShowTimeline(true), [ui.setShowTimeline]);
 const handleCloseSettingsMenu = useCallback(() => ui.setShowSettingsMenu(false), [ui.setShowSettingsMenu]);
 const handleOpenShortcutsHelp = useCallback(() => ui.setShowShortcutsHelp(true), [ui.setShowShortcutsHelp]);
 const handleCloseSearch = useCallback(() => ui.setSearchOpen(false), [ui.setSearchOpen]);
 const handleCloseSidebar = useCallback(() => ui.setSidebarOpen(false), [ui.setSidebarOpen]);
 const handleCloseSynthesis = useCallback(() => ui.setSynthesisOpen(false), [ui.setSynthesisOpen]);
 const handleCloseReadingPlan = useCallback(() => ui.setReadingPlanOpen(false), [ui.setReadingPlanOpen]);
 const handleCloseCompletion = useCallback(() => ui.setShowCompletion(false), [ui.setShowCompletion]);
 const handleCloseMobileSettings = useCallback(() => ui.setShowMobileSettings(false), [ui.setShowMobileSettings]);
 const handleCloseShortcutsHelp = useCallback(() => ui.setShowShortcutsHelp(false), [ui.setShowShortcutsHelp]);
 const handleCloseTimeline = useCallback(() => ui.setShowTimeline(false), [ui.setShowTimeline]);
 const handleDismissSelectionHint = useCallback(() => setHasMadeSelection(true), [setHasMadeSelection]);
 const handleDismissSessionSummary = useCallback(() => setSessionSummary(null), [setSessionSummary]);

 const handleAskAISelection = useCallback((text: string) => {
  const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
  chatHandleRef.current?.openWithMessage(`Can you explain this passage: '${truncated}'`);
 }, [chatHandleRef]);

 const handleCompanionReady = useCallback((handle: CompanionChatHandle) => {
  chatHandleRef.current = handle;
 }, [chatHandleRef]);

 const handleAskAboutCharacter = useCallback((name: string) => {
  chatHandleRef.current?.openWithMessage(`Tell me about ${name} — their role, motivations, and how they've developed so far.`);
 }, [chatHandleRef]);

 const handleTimelineChapterSelect = useCallback((i: number) => {
  handleChapterChange(i);
  ui.setShowTimeline(false);
 }, [handleChapterChange, ui.setShowTimeline]);

 // Warn before leaving if reading session is active
 useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
   if (sessionIdRef.current) {
    e.preventDefault();
   }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
 }, [sessionIdRef]);

 // --- Render ---
 if (loading) {
 return (
  <div className="flex items-center justify-center h-dvh bg-surface-1">
  <div className="text-center">
   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" />
   <p className="text-gray-600">{t('loading')}</p>
  </div>
  </div>
 );
 }
 if (error || !book || chapters.length === 0) {
 return (
  <div className="flex items-center justify-center h-dvh">
  <div className="text-center">
   <p className="text-xl font-semibold mb-4">{error || t('unable_to_load')}</p>
   <Link href="/library" className="btn btn-primary">{t('back_to_library')}</Link>
  </div>
  </div>
 );
 }
 return (
 <div className="h-dvh flex flex-col relative overflow-x-hidden">
  <ReadingBackground content={chapterContent} enabled={bgEnabled} />

  <ReaderHeader
  bookId={bookId}
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
  readingPlanOpen={ui.readingPlanOpen}
  studyModeEnabled={studyMode.enabled}
  settingsMenuOpen={ui.showSettingsMenu}
  timelineOpen={ui.showTimeline}
  onBack={handleBack}
  onToggleBookmark={annotationActions.handleToggleBookmark}
  onToggleSearch={handleToggleSearch}
  onToggleSidebar={handleToggleSidebar}
  onToggleSynthesis={handleToggleSynthesis}
  onToggleReadingPlan={handleToggleReadingPlan}
  onToggleStudyMode={handleToggleStudyMode}
  onShowTimeline={handleShowTimelineCb}
  onShowSettings={handleShowSettings}
  settingsMenu={
   <ReaderSettingsMenu
   show={ui.showSettingsMenu}
   theme={theme}
   fontSize={fontSize}
   lineHeight={lineHeight}
   fontFamily={fontFamily}
   quietMode={quietMode}
   bgEnabled={bgEnabled}
   onClose={handleCloseSettingsMenu}
   onFontSizeChange={setFontSize}
   onLineHeightChange={setLineHeight}
   onFontFamilyChange={setFontFamily}
   onThemeChange={setTheme}
   onQuietModeChange={setQuietMode}
   onBgEnabledChange={setBgEnabled}
   onShowShortcuts={handleOpenShortcutsHelp}
   />
  }
  />
  {ui.searchOpen && (
  <SearchOverlay
   searchQuery={ui.searchQuery}
   onQueryChange={ui.setSearchQuery}
   currentChapter={currentChapter}
   chapters={chapters}
   onNavigate={handleChapterChange}
   onClose={handleCloseSearch}
  />
  )}
  <div className="flex-1 overflow-hidden">
  <div className={`h-full ${pageThemeClasses[theme as ReaderTheme]} ${chapterFade === 'out' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}>
   <ReaderView
   bookId={bookId}
   chapterContent={pageContent || chapterContent}
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
   onScrollProgress={setChapterScrollProgress}
   onPauseAutoHide={ui.pauseAutoHide}
   onResumeAutoHide={ui.resumeAutoHide}
   currentSegment={currentSegment}
   totalSegments={totalSegments}
   onSegmentChange={setCurrentSegment}
   />
  </div>
  </div>
  {!hasMadeSelection && <SelectionHint onDismiss={handleDismissSelectionHint} />}
  <CompanionNudge />
  <FeatureTour />
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
   onAskAI={handleAskAISelection}
  />
  )}
  <AnnotationsSidebar
  annotations={annotations}
  bookId={bookId}
  bookTitle={book?.title}
  author={book?.author}
  totalPages={book?.totalPages}
  currentPage={book?.currentPage}
  progress={book?.progress}
  isOpen={ui.sidebarOpen}
  onClose={handleCloseSidebar}
  onDeleteAnnotation={annotationActions.handleDeleteAnnotation}
  onUpdateAnnotation={annotationActions.handleUpdateAnnotation}
  onScrollToAnnotation={annotationActions.handleScrollToAnnotation}
  />
  <SynthesisPanel bookId={bookId} bookTitle={book?.title} author={book?.author} isOpen={ui.synthesisOpen} onClose={handleCloseSynthesis} />
  <ReadingPlanPanel bookId={bookId} bookTitle={book?.title || ''} isOpen={ui.readingPlanOpen} onClose={handleCloseReadingPlan} />
  {studyMode.enabled && (
  <div className="fixed inset-0 z-20 bg-black/40 md:bg-black/20" onClick={studyMode.toggleStudyMode} onKeyDown={(e) => { if (e.key === 'Escape') studyMode.toggleStudyMode(); }} tabIndex={-1} role="button" aria-label={t('close_study_mode')} />
  )}
  <div className={`fixed right-0 top-[61px] bottom-0 z-20 w-full md:w-80 transition-transform duration-300 ease-out ${studyMode.enabled ? 'translate-x-0' : 'translate-x-full'}`}>
  <div className="h-full overflow-y-auto px-3 pb-4 bg-surface-0">
   <StudyModePanel
   enabled={studyMode.enabled}
   loading={studyMode.loading}
   error={studyMode.error}
   saveStatus={studyMode.saveStatus}
   objectives={studyMode.objectives}
   checks={studyMode.checks}
   revealedAnswers={studyMode.revealedAnswers}
   mastery={studyMode.mastery}
   onLoadMastery={studyMode.loadMastery}
   onToggleObjective={studyMode.toggleObjective}
   onRevealAnswer={studyMode.revealAnswer}
   onSaveChecks={studyMode.saveChecks}
   />
  </div>
  </div>
  <CompanionChatDynamic
  onReady={handleCompanionReady}
  bookId={bookId}
  currentPage={currentChapter}
  totalPages={chapters.length}
  bookTitle={book?.title || ''}
  author={book?.author || ''}
  chapterContent={pageContent || chapterContent}
  genreMetadata={genreMetadata}
  bookDescription={bookDescription}
  externalIsOpen={ui.chatOpen}
  onOpenChange={ui.setChatOpen}
  />
  {!loading && isFiction && pageContent && (
  <FictionPanel
   chapterContent={pageContent}
   chapterIndex={currentChapter}
   onAskAboutCharacter={handleAskAboutCharacter}
  />
  )}
  {!loading && book && !quietMode && (
  <InterventionToast
   bookId={bookId}
   currentPage={currentChapter}
   totalPages={chapters.length}
   sessionDuration={ui.sessionElapsed}
   highlightCount={annotationActions.totalHighlights}
  />
  )}
  {ui.showCompletion && book && (
  <BookCompletionModal
   bookId={book.id}
   bookTitle={book.title}
   totalHighlights={annotationActions.totalHighlights}
   totalNotes={annotationActions.totalNotes}
   totalChapters={chapters.length}
   onClose={handleCloseCompletion}
  />
  )}
  {sessionSummary && (
  <SessionSummaryModal
   duration={sessionSummary.duration}
   chaptersRead={sessionSummary.chaptersRead}
   totalChapters={chapters.length}
   sessionId={sessionSummary.sessionId}
   onKeepReading={handleDismissSessionSummary}
   onBackToLibrary={handleBackToLibrary}
  />
  )}
  {highlightMode && (
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-md animate-fade-in backdrop-blur-sm">
   {t('tap_to_highlight')}
  </div>
  )}
  {ui.milestone && (
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
   <div className="px-4 py-1.5 rounded-full bg-surface-0/90 backdrop-blur-sm text-amber-700 dark:text-amber-300 text-xs font-medium shadow-md border border-amber-200/50 dark:border-amber-800/50">
   {ui.milestone} {t('milestone_complete')}
   </div>
  </div>
  )}
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
   onClose={handleCloseMobileSettings}
  />
  )}
  <button
  onClick={handleOpenShortcutsHelp}
  className="hidden sm:flex fixed bottom-5 right-20 z-10 w-11 h-11 rounded-full bg-surface-0/60 backdrop-blur-sm border border-gray-200/50/50 text-gray-300 hover:text-amber-500 hover:border-amber-300/50 transition-all items-center justify-center"
  aria-label={t('keyboard_shortcuts_help')}
  >
  <span className="text-xs font-bold">?</span>
  </button>
  {ui.showShortcutsHelp && <ShortcutsHelp onClose={handleCloseShortcutsHelp} />}
  {ui.showTimeline && book && (
  <ChapterTimeline
   bookId={book.id}
   totalChapters={chapters.length}
   currentChapter={currentChapter}
   chapterTitles={chapterTitles}
   onChapterSelect={handleTimelineChapterSelect}
   onClose={handleCloseTimeline}
  />
  )}
 </div>
 );
}
