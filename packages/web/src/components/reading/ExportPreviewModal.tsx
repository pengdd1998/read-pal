'use client';

import React, { useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ExportFilterPanel } from './ExportFilterPanel';
import { useExportShareLink } from './useExportShareLink';
import { ExportModalHeader } from './export/ExportModalHeader';
import { ExportFormatSelector } from './export/ExportFormatSelector';
import { ExportPreviewPanel } from './export/ExportPreviewPanel';
import { ExportActionFooter } from './export/ExportActionFooter';
import { useExportActions } from './export/useExportActions';

interface ExportPreviewModalProps {
  bookId: string;
  bookTitle?: string;
  availableTags?: string[];
  onClose: () => void;
}

export const ExportPreviewModal = React.memo(function ExportPreviewModal({ bookId, bookTitle, availableTags = [], onClose }: ExportPreviewModalProps) {
  const t = useTranslations('reader');
  const {
    format,
    preview,
    loading,
    selectedTypes,
    selectedTag,
    showFilters,
    isCitationFormat,
    hasActiveFilters,
    canShare,
    handleFormatChange,
    handleToggleType,
    handleSetSelectedTag,
    handleToggleShowFilters,
    handleClearFilters,
    handlePreview,
    handleDownload,
    handleCopy,
  } = useExportActions(bookId);

  const { shareLink, sharing, handleShareLink } = useExportShareLink({
    bookId,
    format,
    selectedTypes,
    selectedTag,
  });

  const backdropRef = useRef<HTMLDivElement>(null);
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => { if (e.target === backdropRef.current) onClose(); }, [onClose]);
  const handleBackdropKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape') onClose(); }, [onClose]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
    >
      <div role="dialog" aria-modal="true" aria-label={t('export_aria_label')} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} className="bg-surface-0 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-surface-3">
        <ExportModalHeader bookTitle={bookTitle} onClose={onClose} />

        {/* Format + Filter selection */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          <ExportFormatSelector format={format} onFormatChange={handleFormatChange} />

          {!isCitationFormat && (
            <ExportFilterPanel
              selectedTypes={selectedTypes}
              selectedTag={selectedTag}
              availableTags={availableTags}
              showFilters={showFilters}
              hasActiveFilters={hasActiveFilters}
              onToggleType={handleToggleType}
              onSetSelectedTag={handleSetSelectedTag}
              onToggleShowFilters={handleToggleShowFilters}
              onClearFilters={handleClearFilters}
            />
          )}

          {preview && (
            <ExportPreviewPanel preview={preview} onCopy={handleCopy} />
          )}
        </div>

        <ExportActionFooter
          loading={loading}
          hasPreview={preview !== null}
          canShare={canShare}
          shareLink={shareLink}
          sharing={sharing}
          onPreview={handlePreview}
          onDownload={handleDownload}
          onShareLink={handleShareLink}
        />
      </div>
    </div>
  );
});
