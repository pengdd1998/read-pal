'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';

interface ExportActionFooterProps {
  loading: boolean;
  hasPreview: boolean;
  canShare: boolean;
  shareLink: string | null;
  sharing: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onShareLink: () => void;
}

export const ExportActionFooter = React.memo(function ExportActionFooter({
  loading,
  hasPreview,
  canShare,
  shareLink,
  sharing,
  onPreview,
  onDownload,
  onShareLink,
}: ExportActionFooterProps) {
  const t = useTranslations('reader');
  const { toast } = useToast();

  return (
    <>
      {/* Action buttons */}
      <div className="px-5 py-4 border-t border-surface-3 flex gap-2">
        <button
          onClick={onPreview}
          disabled={loading}
          className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-surface-3 text-gray-700 dark:text-gray-300 hover:bg-surface-1 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {loading ? t('export_loading') : hasPreview ? t('export_refresh') : t('export_preview_button')}
        </button>
        <button
          onClick={onDownload}
          disabled={loading}
          className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          {t('export_download')}
        </button>
      </div>

      {/* Share link section */}
      {canShare && (
        <div className="px-5 pb-4">
          {!shareLink ? (
            <button
              onClick={onShareLink}
              disabled={sharing}
              className="w-full px-4 py-2.5 text-sm font-medium rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {sharing ? t('export_creating_link') : t('export_share_via_link')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareLink}
                aria-label={t('export_share_via_link')}
                className="flex-1 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg text-gray-700 dark:text-gray-300"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => { navigator.clipboard.writeText(shareLink); toast(t('export_link_copied'), 'success'); }}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
              >
                {t('export_copy')}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
});
