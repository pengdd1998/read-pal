'use client';

import { useTranslations } from 'next-intl';

type ViewMode = 'list' | 'outline';

interface SidebarHeaderProps {
  annotationCount: number;
  viewMode: ViewMode;
  bulkMode: boolean;
  onClose: () => void;
  onToggleViewMode: () => void;
  onToggleBulkMode: () => void;
  onShowShareDialog: () => void;
  onShowExportModal: () => void;
}

export function SidebarHeader({
  annotationCount,
  viewMode,
  bulkMode,
  onClose,
  onToggleViewMode,
  onToggleBulkMode,
  onShowShareDialog,
  onShowExportModal,
}: SidebarHeaderProps) {
  const t = useTranslations('reader');

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
      <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
        {t('sidebar_annotations')}
      </h2>
      <button
        onClick={onClose}
        className="p-2.5 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={t('sidebar_close_esc')}
        title={t('sidebar_close_esc')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      {annotationCount > 0 && (
        <button
          onClick={onToggleViewMode}
          className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
            viewMode === 'outline'
              ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20'
              : 'text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          }`}
          title={viewMode === 'list' ? t('sidebar_outline_view') : t('sidebar_list_view')}
          aria-label={viewMode === 'list' ? t('sidebar_switch_outline') : t('sidebar_switch_list')}
        >
          {viewMode === 'list' ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M3 8h12M3 12h18M3 16h12M3 20h18" />
            </svg>
          )}
        </button>
      )}
      {annotationCount > 0 && (
        <button
          onClick={onToggleBulkMode}
          className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
            bulkMode
              ? 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20'
              : 'text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          }`}
          title={bulkMode ? t('sidebar_cancel_selection') : t('sidebar_select_multiple')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </button>
      )}
      {annotationCount > 0 && (
        <>
          <button
            aria-label={t('sidebar_share_export')}
            onClick={onShowShareDialog}
            className="p-2 rounded-lg text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title={t('sidebar_share_export')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          <button
            aria-label={t('sidebar_export_annotations')}
            onClick={onShowExportModal}
            className="p-2 rounded-lg text-gray-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
            title={t('sidebar_export_annotations')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
