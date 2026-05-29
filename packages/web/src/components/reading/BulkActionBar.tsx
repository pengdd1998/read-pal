'use client';

import { useTranslations } from 'next-intl';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onBulkDelete: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExitBulkMode: () => void;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  onBulkDelete,
  onSelectAll,
  onDeselectAll,
  onExitBulkMode,
}: BulkActionBarProps) {
  const t = useTranslations('reader');

  return (
    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/50 dark:border-amber-900/30 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
          {t('sidebar_selected', { count: selectedCount })}
        </span>
        <button
          onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
          className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
        >
          {selectedCount === totalCount ? t('sidebar_deselect_all') : t('sidebar_select_all')}
        </button>
      </div>
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <button
            onClick={onBulkDelete}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors active:scale-95"
          >
            {t('sidebar_delete_count', { count: selectedCount })}
          </button>
        )}
        <button
          onClick={onExitBulkMode}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {t('sidebar_done')}
        </button>
      </div>
    </div>
  );
}
