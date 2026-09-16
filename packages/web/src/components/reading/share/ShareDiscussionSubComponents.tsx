'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// QuestionItem — single list item for discussion questions
// ---------------------------------------------------------------------------

interface QuestionItemProps {
  question: string;
  index: number;
}

const QuestionItem = React.memo(function QuestionItem({ question }: QuestionItemProps) {
  return <li>{question}</li>;
});

export { QuestionItem };

// ---------------------------------------------------------------------------
// ActionButton — reusable icon+label button for the action grid
// ---------------------------------------------------------------------------

interface ActionButtonProps {
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
  children: React.ReactNode;
}

const ActionButton = React.memo(function ActionButton({
  ariaLabel,
  onClick,
  disabled,
  variant = 'default',
  children,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
        isPrimary
          ? 'border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50'
          : 'border-surface-3 hover:bg-surface-1'
      }`}
    >
      {children}
    </button>
  );
});

export { ActionButton };

// ---------------------------------------------------------------------------
// GenerateButton — primary CTA with spinner state
// ---------------------------------------------------------------------------

interface GenerateButtonProps {
  generating: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  generatingLabel: string;
}

const GenerateButton = React.memo(function GenerateButton({
  generating,
  disabled,
  onClick,
  label,
  generatingLabel,
}: GenerateButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={generating || disabled}
      className="w-full px-4 py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
    >
      {generating ? (
        <span className="flex items-center justify-center gap-2">
          <svg aria-hidden="true" className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {generatingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  );
});

export { GenerateButton };

// ---------------------------------------------------------------------------
// GuidePreview — iframe preview + AI-generated questions
// ---------------------------------------------------------------------------

interface GuidePreviewProps {
  guideHtml: string;
  previewTitle: string;
  questions: string[];
  questionTitle: string;
  questionWarning: boolean;
  questionsUnavailableText: string;
}

const GuidePreview = React.memo(function GuidePreview({
  guideHtml,
  previewTitle,
  questions,
  questionTitle,
  questionWarning,
  questionsUnavailableText,
}: GuidePreviewProps) {
  return (
    <>
      {/* Preview */}
      <div className="rounded-xl border border-surface-3 overflow-hidden">
        <div className="bg-surface-1 p-3 max-h-48 overflow-y-auto">
          <iframe
            srcDoc={guideHtml}
            title={previewTitle}
            className="w-full h-40 border-0 pointer-events-none"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Questions preview */}
      {questions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            {questionTitle}
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {questions.map((q, i) => (
              <QuestionItem key={q} question={q} index={i} />
            ))}
          </ol>
        </div>
      )}
      {questionWarning && questions.length === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{questionsUnavailableText}</p>
      )}
    </>
  );
});

export { GuidePreview };

// ---------------------------------------------------------------------------
// ActionGrid — 4-button grid (copy, download, print, share)
// ---------------------------------------------------------------------------

interface ActionGridProps {
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onShareLink: () => void;
  sharing: boolean;
  copyLabel: string;
  htmlLabel: string;
  printLabel: string;
  linkLabel: string;
}

const ActionGrid = React.memo(function ActionGrid({
  onCopy,
  onDownload,
  onPrint,
  onShareLink,
  sharing,
  copyLabel,
  htmlLabel,
  printLabel,
  linkLabel,
}: ActionGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      <ActionButton ariaLabel={copyLabel} onClick={onCopy}>
        <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span className="text-xs text-gray-600 dark:text-gray-400">{copyLabel}</span>
      </ActionButton>

      <ActionButton ariaLabel={htmlLabel} onClick={onDownload}>
        <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="text-xs text-gray-600 dark:text-gray-400">{htmlLabel}</span>
      </ActionButton>

      <ActionButton ariaLabel={printLabel} onClick={onPrint}>
        <svg aria-hidden="true" className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        <span className="text-xs text-gray-600 dark:text-gray-400">{printLabel}</span>
      </ActionButton>

      <ActionButton ariaLabel={linkLabel} onClick={onShareLink} disabled={sharing} variant="primary">
        <svg aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        <span className="text-xs text-amber-600 dark:text-amber-400">{linkLabel}</span>
      </ActionButton>
    </div>
  );
});

export { ActionGrid };

// ---------------------------------------------------------------------------
// ShareLinkBar — share link display with copy button
// ---------------------------------------------------------------------------

interface ShareLinkBarProps {
  shareLink: string;
  linkLabel: string;
  copyLabel: string;
  onCopy: () => void;
}

const ShareLinkBar = React.memo(function ShareLinkBar({
  shareLink,
  linkLabel,
  copyLabel,
  onCopy,
}: ShareLinkBarProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={shareLink}
        aria-label={linkLabel}
        className="flex-1 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-amber-500/30"
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      <button
        type="button"
        onClick={onCopy}
        className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {copyLabel}
      </button>
    </div>
  );
});

export { ShareLinkBar };
