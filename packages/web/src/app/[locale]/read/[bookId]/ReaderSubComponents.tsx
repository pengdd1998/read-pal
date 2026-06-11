'use client';

import React, { type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import {
  BookCompletionModal, SessionSummaryModal, MobileSettingsSheet,
} from '@/components/reading/ReaderDynamicImports';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
export const ReaderLoadingSkeleton = React.memo(function ReaderLoadingSkeleton({
  ariaLabel,
}: {
  ariaLabel: string;
}) {
  return (
    <main id="main-content" aria-label={ariaLabel} className="h-dvh bg-surface-1">
      {/* Reader skeleton loader */}
      <div className="h-14 border-b border-gray-200 flex items-center px-4 gap-3">
        <div className="w-8 h-8 rounded-md bg-gray-200 animate-pulse" />
        <div className="flex-1">
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse mb-1" />
          <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-8 h-8 rounded-md bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="h-8 w-64 rounded bg-gray-200 animate-pulse mb-6" />
        {[85, 92, 75, 95, 80, 88].map((w, i) => (
          <div key={i} className="mb-4">
            <div
              className="h-4 rounded bg-gray-200 animate-pulse mb-2"
              style={{ width: `${w}%` }}
            />
            <div
              className="h-4 rounded bg-gray-200 animate-pulse"
              style={{ width: `${w - 20}%` }}
            />
          </div>
        ))}
        <div className="flex justify-between mt-8">
          <div className="h-10 w-24 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-10 w-24 rounded-lg bg-gray-200 animate-pulse" />
        </div>
      </div>
    </main>
  );
});

// ---------------------------------------------------------------------------
// Error / empty state
// ---------------------------------------------------------------------------
export const ReaderErrorState = React.memo(function ReaderErrorState({
  error,
  ariaLabel,
  retryLabel,
  backToLibraryLabel,
  unableToLoadLabel,
  networkErrorHint,
  bookNotFoundHint,
  failedConnectLabel,
}: {
  error: string | null;
  ariaLabel: string;
  retryLabel: string;
  backToLibraryLabel: string;
  unableToLoadLabel: string;
  networkErrorHint: string;
  bookNotFoundHint: string;
  failedConnectLabel: string;
}) {
  const isNetworkError = error === failedConnectLabel;

  return (
    <main
      id="main-content"
      aria-label={ariaLabel}
      className="flex items-center justify-center h-dvh bg-surface-1"
    >
      <div className="text-center max-w-md px-4">
        <div className="text-4xl mb-4">{isNetworkError ? '🔌' : '📖'}</div>
        <p className="text-xl font-semibold mb-2">{error || unableToLoadLabel}</p>
        <p className="text-gray-500 mb-6 text-sm">
          {isNetworkError ? networkErrorHint : bookNotFoundHint}
        </p>
        <div className="flex gap-3 justify-center">
          <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary">
            {retryLabel}
          </button>
          <Link href="/library" prefetch={false} className="btn btn-primary">
            {backToLibraryLabel}
          </Link>
        </div>
      </div>
    </main>
  );
});

// ---------------------------------------------------------------------------
// Study mode overlay backdrop + slide-in panel wrapper
// ---------------------------------------------------------------------------
export const StudyModeOverlay = React.memo(function StudyModeOverlay({
  enabled,
  closeLabel,
  onToggleStudyMode,
  children,
}: {
  enabled: boolean;
  closeLabel: string;
  onToggleStudyMode: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {enabled && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:bg-black/20"
          onClick={onToggleStudyMode}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onToggleStudyMode();
          }}
          tabIndex={-1}
          role="button"
          aria-label={closeLabel}
        />
      )}
      <div
        className={`fixed right-0 top-[61px] bottom-0 z-20 w-full md:w-80 transition-transform duration-300 ease-out ${
          enabled ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-y-auto px-3 pb-4 bg-surface-0">
          {children}
        </div>
      </div>
    </>
  );
});

// ---------------------------------------------------------------------------
// Highlight mode badge + milestone indicator
// ---------------------------------------------------------------------------
export const ReaderStatusIndicators = React.memo(function ReaderStatusIndicators({
  highlightMode,
  highlightModeLabel,
  milestone,
  milestoneLabel,
}: {
  highlightMode: boolean;
  highlightModeLabel: string;
  milestone: string | null;
  milestoneLabel: string;
}) {
  return (
    <>
      {highlightMode && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-amber-500/90 text-white text-xs font-medium shadow-md animate-fade-in backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          {highlightModeLabel}
        </div>
      )}
      {milestone && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-10 animate-fade-in" role="status" aria-live="polite">
          <div className="px-4 py-1.5 rounded-full bg-surface-0/90 backdrop-blur-sm text-amber-700 dark:text-amber-300 text-xs font-medium shadow-md border border-amber-200/50 dark:border-amber-800/50">
            {milestone} {milestoneLabel}
          </div>
        </div>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Shortcuts help floating button
// ---------------------------------------------------------------------------
export const ShortcutsHelpButton = React.memo(function ShortcutsHelpButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden sm:flex fixed bottom-5 right-20 z-10 w-11 h-11 rounded-full bg-surface-0/60 backdrop-blur-sm border border-gray-200/50 text-gray-500 hover:text-amber-500 hover:border-amber-300/50 focus-visible:ring-2 focus-visible:ring-amber-400 transition-all items-center justify-center"
      aria-label={ariaLabel}
    >
      <span className="text-xs font-bold">?</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Conditionally-rendered modal overlays (completion, session summary, mobile settings)
// ---------------------------------------------------------------------------
interface ReaderModalsProps {
  showCompletion: boolean;
  showMobileSettings: boolean;
  sessionSummary: {
    duration: number;
    chaptersRead: number;
    sessionId?: string;
  } | null;
  bookId: string;
  bookTitle: string;
  totalChapters: number;
  totalHighlights: number;
  totalNotes: number;
  fontSize: number;
  theme: string;
  quietMode: boolean;
  fontFamily: string;
  lineHeight: number;
  onCloseCompletion: () => void;
  onCloseMobileSettings: () => void;
  onDismissSessionSummary: () => void;
  onBackToLibrary: () => void;
  onFontSizeChange: (v: number) => void;
  onThemeChange: (v: 'light' | 'dark' | 'sepia') => void;
  onQuietModeChange: (v: boolean) => void;
  onFontFamilyChange: (v: string) => void;
  onLineHeightChange: (v: number) => void;
}

export const ReaderModals = React.memo(function ReaderModals({
  showCompletion,
  showMobileSettings,
  sessionSummary,
  bookId,
  bookTitle,
  totalChapters,
  totalHighlights,
  totalNotes,
  fontSize,
  theme,
  quietMode,
  fontFamily,
  lineHeight,
  onCloseCompletion,
  onCloseMobileSettings,
  onDismissSessionSummary,
  onBackToLibrary,
  onFontSizeChange,
  onThemeChange,
  onQuietModeChange,
  onFontFamilyChange,
  onLineHeightChange,
}: ReaderModalsProps) {
  return (
    <>
      {showCompletion && (
        <BookCompletionModal
          bookId={bookId}
          bookTitle={bookTitle}
          totalHighlights={totalHighlights}
          totalNotes={totalNotes}
          totalChapters={totalChapters}
          onClose={onCloseCompletion}
        />
      )}
      {sessionSummary && (
        <SessionSummaryModal
          duration={sessionSummary.duration}
          chaptersRead={sessionSummary.chaptersRead}
          totalChapters={totalChapters}
          sessionId={sessionSummary.sessionId}
          onKeepReading={onDismissSessionSummary}
          onBackToLibrary={onBackToLibrary}
        />
      )}
      {showMobileSettings && (
        <MobileSettingsSheet
          fontSize={fontSize}
          theme={theme}
          quietMode={quietMode}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          onFontSizeChange={onFontSizeChange}
          onThemeChange={onThemeChange}
          onQuietModeChange={onQuietModeChange}
          onFontFamilyChange={onFontFamilyChange}
          onLineHeightChange={onLineHeightChange}
          onClose={onCloseMobileSettings}
        />
      )}
    </>
  );
});
