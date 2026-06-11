'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface BulkActionBarProps {
 selectedCount: number;
 totalCount: number;
 confirmDelete: boolean;
 deleting?: boolean;
 onBulkDelete: () => void;
 onConfirmBulkDelete: () => void;
 onCancelBulkDelete: () => void;
 onSelectAll: () => void;
 onDeselectAll: () => void;
 onExitBulkMode: () => void;
}

export const BulkActionBar = React.memo(function BulkActionBar({
 selectedCount,
 totalCount,
 confirmDelete,
 deleting = false,
 onBulkDelete,
 onConfirmBulkDelete,
 onCancelBulkDelete,
 onSelectAll,
 onDeselectAll,
 onExitBulkMode,
}: BulkActionBarProps) {
 const t = useTranslations('reader');
 const tc = useTranslations('common');

 return (
 <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200/50 dark:border-amber-900/30 flex items-center justify-between">
  <div className="flex items-center gap-2">
  <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
   {t('sidebar_selected', { count: selectedCount })}
  </span>
  <button type="button"
   onClick={selectedCount === totalCount ? onDeselectAll : onSelectAll}
   className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
   {selectedCount === totalCount ? t('sidebar_deselect_all') : t('sidebar_select_all')}
  </button>
  </div>
  <div className="flex items-center gap-2">
  {selectedCount > 0 && !confirmDelete && (
   <button type="button"
   onClick={onBulkDelete}
   className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
   {t('sidebar_delete_count', { count: selectedCount })}
   </button>
  )}
  {confirmDelete && (
   <>
   <span className="text-xs text-red-600 dark:text-red-400">{tc('confirm_delete')}</span>
   <button type="button"
    onClick={onConfirmBulkDelete}
    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
    {tc('yes')}
   </button>
   <button type="button"
    onClick={onCancelBulkDelete}
    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-surface-2 min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
    {tc('cancel')}
   </button>
   </>
  )}
  <button type="button"
   onClick={onExitBulkMode}
   className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
   {t('sidebar_done')}
  </button>
  </div>
 </div>
 );
});
