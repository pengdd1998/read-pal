'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ExportPreviewPanelProps {
  preview: string;
  onCopy: () => void;
}

export const ExportPreviewPanel = React.memo(function ExportPreviewPanel({
  preview,
  onCopy,
}: ExportPreviewPanelProps) {
  const t = useTranslations('reader');

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('export_preview_label')}</span>
        <button type="button"
          onClick={onCopy}
          aria-label={t('export_copy')}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        >
          {t('export_copy')}
        </button>
      </div>
      <pre className="bg-surface-1 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40 whitespace-pre-wrap break-words border border-surface-3">
        {preview.slice(0, 2000)}{preview.length > 2000 ? '\n…' : ''}
      </pre>
    </div>
  );
});
