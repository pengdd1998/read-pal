'use client';

import { useTranslations } from 'next-intl';
import { useReaderPage } from '@/hooks/useReaderPage';
import type { CompanionChatHandle } from '@/components/reading/CompanionChat';
import { pageThemeClasses, type ReaderTheme } from '@/lib/reader-theme';
import { SelectionHint } from '@/components/reading/SelectionHint';
import { CompanionNudge } from '@/components/reading/CompanionNudge';
import { ShortcutsHelp } from '@/components/reading/ShortcutsHelp';
import { ReaderHeader } from '@/components/reading/ReaderHeader';
import { ReaderSettingsMenu } from '@/components/reading/ReaderSettingsMenu';
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
    sessionSummary, setSessionSummary, sessionStartRef, sessionIdRef,
    chapterScrollProgress, setChapterScrollProgress, isFiction, chapterTitles,
    ui, handleChapterChange, handleBack, handleShowSettings,
    handleToggleStudyMode, handleBackToLibrary,
    setCurrentChapter, setCurrentSegment,
    annotationActions, selection, studyMode,
  } = useReaderPage();

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
        onToggleSearch={() => ui.setSearchOpen(!ui.searchOpen)}
        onToggleSidebar={() => ui.setSidebarOpen(!ui.sidebarOpen)}
        onToggleSynthesis={() => ui.setSynthesisOpen(!ui.synthesisOpen)}
        onToggleReadingPlan={() => ui.setReadingPlanOpen(!ui.readingPlanOpen)}
        onToggleStudyMode={handleToggleStudyMode}
        onShowTimeline={() => ui.setShowTimeline(true)}
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
      {ui.searchOpen && (
        <SearchOverlay
          searchQuery={ui.searchQuery}
          onQueryChange={ui.setSearchQuery}
          currentChapter={currentChapter}
          chapters={chapters}
          onNavigate={(idx: number) => handleChapterChange(idx)}
          onClose={() => ui.setSearchOpen(false)}
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
      {!hasMadeSelection && <SelectionHint onDismiss={() => setHasMadeSelection(true)} />}
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
          onAskAI={(text: string) => {
            const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
            chatHandleRef.current?.openWithMessage(`Can you explain this passage: '${truncated}'`);
          }}
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
        onClose={() => ui.setSidebarOpen(false)}
        onDeleteAnnotation={annotationActions.handleDeleteAnnotation}
        onUpdateAnnotation={annotationActions.handleUpdateAnnotation}
        onScrollToAnnotation={annotationActions.handleScrollToAnnotation}
      />
      <SynthesisPanel bookId={bookId} bookTitle={book?.title} author={book?.author} isOpen={ui.synthesisOpen} onClose={() => ui.setSynthesisOpen(false)} />
      <ReadingPlanPanel bookId={bookId} bookTitle={book?.title || ''} isOpen={ui.readingPlanOpen} onClose={() => ui.setReadingPlanOpen(false)} />
      {studyMode.enabled && (
        <div className="fixed inset-0 z-20 bg-black/40 md:bg-black/20" onClick={studyMode.toggleStudyMode} onKeyDown={(e) => { if (e.key === 'Escape') studyMode.toggleStudyMode(); }} tabIndex={-1} role="button" aria-label={t('close_study_mode')} />
      )}
      <div className={`fixed right-0 top-[61px] bottom-0 z-20 w-full md:w-80 transition-transform duration-300 ease-out ${studyMode.enabled ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full overflow-y-auto px-3 pb-4 bg-surface-0 md:bg-transparent">
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
      <CompanionChatDynamic
        onReady={(handle: CompanionChatHandle) => { chatHandleRef.current = handle; }}
        bookId={bookId}
        currentPage={currentChapter}
        totalPages={chapters.length}
        bookTitle={book?.title || ''}
        author={book?.author || ''}
        chapterContent={pageContent || chapterContent}
        genreMetadata={(book?.metadata as Record<string, unknown> | undefined)?.genre as string[] | string | undefined}
        bookDescription={(book?.metadata as Record<string, unknown> | undefined)?.description as string | undefined}
      />
      {!loading && isFiction && pageContent && (
        <FictionPanel
          chapterContent={pageContent}
          chapterIndex={currentChapter}
          onAskAboutCharacter={(name: string) => {
            chatHandleRef.current?.openWithMessage(`Tell me about ${name} — their role, motivations, and how they've developed so far.`);
          }}
        />
      )}
      {!loading && book && !quietMode && (
        <InterventionToast
          bookId={bookId}
          currentPage={currentChapter}
          totalPages={chapters.length}
          sessionDuration={Math.round((Date.now() - sessionStartRef.current) / 1000)}
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
          onClose={() => ui.setShowCompletion(false)}
        />
      )}
      {sessionSummary && (
        <SessionSummaryModal
          duration={sessionSummary.duration}
          chaptersRead={sessionSummary.chaptersRead}
          totalChapters={chapters.length}
          sessionId={sessionSummary.sessionId}
          onKeepReading={() => setSessionSummary(null)}
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
          onClose={() => ui.setShowMobileSettings(false)}
        />
      )}
      <button
        onClick={() => ui.setShowShortcutsHelp(true)}
        className="hidden sm:flex fixed bottom-5 right-20 z-10 w-9 h-9 rounded-full bg-surface-0/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 text-gray-300 dark:text-gray-600 hover:text-amber-500 hover:border-amber-300/50 transition-all items-center justify-center"
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
          onChapterSelect={(i: number) => { setCurrentChapter(i); ui.setShowTimeline(false); }}
          onClose={() => ui.setShowTimeline(false)}
        />
      )}
    </div>
  );
}
