'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface ActionButtonsProps {
 onRegenerate: () => void;
 onDownload: () => void;
 onPrint: () => void;
}

export default React.memo(function ActionButtons({
 onRegenerate,
 onDownload,
 onPrint,
}: ActionButtonsProps) {
 const t = useTranslations('memoryBooks');

 return (
 <div className="flex items-center gap-2">
  <button type="button"
  onClick={onRegenerate}
  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
  title={t('regenerate_title')}
  aria-label={t('regenerate_title')}
  >
  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
  </button>
  <button type="button"
  onClick={onDownload}
  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
  title={t('download_html_title')}
  aria-label={t('download_html_title')}
  >
  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
  </button>
  <button type="button"
  onClick={onPrint}
  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
  title={t('print_save_pdf')}
  aria-label={t('print_save_pdf')}
  >
  <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
   <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
  </button>
 </div>
 );
});
