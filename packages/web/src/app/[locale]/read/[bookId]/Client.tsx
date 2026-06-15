'use client';

import { useEffect } from 'react';
import { useReaderPage } from '@/hooks/useReaderPage';
import { pageThemeClasses, type ReaderTheme } from '@/lib/reader-theme';
import { SelectionHint } from '@/components/reading/SelectionHint';
import { CompanionNudge } from '@/components/reading/CompanionNudge';
import { ShortcutsHelp } from '@/components/reading/ShortcutsHelp';
import { ReaderHeader } from '@/components/reading/ReaderHeader';
import { ReaderSettingsMenu } from '@/components/reading/ReaderSettingsMenu';
import {
  ReaderView, CompanionChatDynamic, SelectionToolbar, AnnotationsSidebar,
  ReadingBackground, InterventionToast, SearchOverlay, SynthesisPanel,
  ReadingPlanPanel, StudyModePanel, FictionPanel, ChapterTimeline, FeatureTour,
} from '@/components/reading/ReaderDynamicImports';
import {
  ReaderLoadingSkeleton, ReaderErrorState, StudyModeOverlay,
  ReaderStatusIndicators, ShortcutsHelpButton, ReaderModals,
} from './ReaderSubComponents';
import { useReaderCallbacks } from './useReaderCallbacks';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ReadPage() {
  const {
    bookId, t,
    book, chapters, currentChapter, annotations, loading, error,
    chapterContent, chapterFade,
    currentSegment, totalSegments, pageContent,
    contentRef, chatHandleRef,
    fontSize, setFontSize, theme, setTheme, quietMode, setQuietMode,
    fontFamily, setFontFamily, lineHeight, setLineHeight,
    bgEnabled, setBgEnabled, highlightMode,
    readingPph, hasMadeSelection, setHasMadeSelection,
    sessionSummary, setSessionSummary, sessionIdRef,
    setChapterScrollProgress, isFiction, chapterTitles, genreMetadata, bookDescription,
    ui, handleChapterChange, handleBack, handleShowSettings,
    handleToggleStudyMode, handleBackToLibrary,
    setCurrentSegment,
    annotationActions, selection, studyMode,
  } = useReaderPage();

  const {
    handleToggleSearch, handleToggleSidebar, handleToggleSynthesis,
    handleToggleReadingPlan, handleShowTimelineCb, handleCloseSettingsMenu,
    handleOpenShortcutsHelp, handleCloseSearch, handleCloseSidebar,
    handleCloseSynthesis, handleCloseReadingPlan, handleCloseCompletion,
    handleCloseMobileSettings, handleCloseShortcutsHelp, handleCloseTimeline,
    handleDismissSelectionHint, handleDismissSessionSummary,
    handleAskAISelection, handleCompanionReady, handleAskAboutCharacter,
    handleTimelineChapterSelect,
  } = useReaderCallbacks({
    setHasMadeSelection, setSessionSummary, chatHandleRef,
    t: t as (key: string, params?: Record<string, unknown>) => string,
    handleChapterChange, setShowTimeline: ui.setShowTimeline,
    setSearchOpen: ui.setSearchOpen, setSidebarOpen: ui.setSidebarOpen,
    setSynthesisOpen: ui.setSynthesisOpen, setReadingPlanOpen: ui.setReadingPlanOpen,
    setShowSettingsMenu: ui.setShowSettingsMenu, setShowShortcutsHelp: ui.setShowShortcutsHelp,
    setShowCompletion: ui.setShowCompletion, setShowMobileSettings: ui.setShowMobileSettings,
    setShowTimelineDirect: ui.setShowTimeline,
  });

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
    return <ReaderLoadingSkeleton ariaLabel={t('readingPage')} />;
  }

  if (error || !book || chapters.length === 0) {
    return (
      <ReaderErrorState
        error={error}
        ariaLabel={t('readingPage')}
        retryLabel={t('retry')}
        backToLibraryLabel={t('back_to_library')}
        unableToLoadLabel={t('unable_to_load')}
        networkErrorHint={t('network_error_hint')}
        bookNotFoundHint={t('book_not_found_hint')}
        failedConnectLabel={t('failed_connect')}
      />
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
        readingPph={readingPph}
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
      <ErrorBoundary label="SynthesisPanel">
        <SynthesisPanel bookId={bookId} bookTitle={book?.title} author={book?.author} isOpen={ui.synthesisOpen} onClose={handleCloseSynthesis} />
      </ErrorBoundary>
      <ReadingPlanPanel bookId={bookId} isOpen={ui.readingPlanOpen} onClose={handleCloseReadingPlan} />
      <ErrorBoundary label="StudyMode">
        <StudyModeOverlay enabled={studyMode.enabled} closeLabel={t('close_study_mode')} onToggleStudyMode={studyMode.toggleStudyMode}>
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
        </StudyModeOverlay>
      </ErrorBoundary>
      <ErrorBoundary label="CompanionChat">
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
      </ErrorBoundary>
      {!loading && isFiction && pageContent && (
        <ErrorBoundary label="FictionPanel">
          <FictionPanel chapterContent={pageContent} chapterIndex={currentChapter} onAskAboutCharacter={handleAskAboutCharacter} />
        </ErrorBoundary>
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
      <ReaderModals
        showCompletion={!!(ui.showCompletion && book)}
        showMobileSettings={!!ui.showMobileSettings}
        sessionSummary={sessionSummary}
        bookId={book?.id || ''}
        bookTitle={book?.title || ''}
        totalChapters={chapters.length}
        totalHighlights={annotationActions.totalHighlights}
        totalNotes={annotationActions.totalNotes}
        fontSize={fontSize}
        theme={theme}
        quietMode={quietMode}
        fontFamily={fontFamily}
        lineHeight={lineHeight}
        onCloseCompletion={handleCloseCompletion}
        onCloseMobileSettings={handleCloseMobileSettings}
        onDismissSessionSummary={handleDismissSessionSummary}
        onBackToLibrary={handleBackToLibrary}
        onFontSizeChange={setFontSize}
        onThemeChange={setTheme}
        onQuietModeChange={setQuietMode}
        onFontFamilyChange={setFontFamily}
        onLineHeightChange={setLineHeight}
      />
      <ReaderStatusIndicators
        highlightMode={highlightMode}
        highlightModeLabel={t('tap_to_highlight')}
        milestone={ui.milestone}
        milestoneLabel={t('milestone_complete')}
      />
      <ShortcutsHelpButton ariaLabel={t('keyboard_shortcuts_help')} onClick={handleOpenShortcutsHelp} />
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
