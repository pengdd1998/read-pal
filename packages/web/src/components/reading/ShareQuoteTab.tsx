'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { Annotation } from '@read-pal/shared';

interface ShareQuoteTabProps {
 selectedAnnotation?: Annotation | null;
}

export const ShareQuoteTab = React.memo(function ShareQuoteTab({ selectedAnnotation }: ShareQuoteTabProps) {
 const t = useTranslations('reader');

 if (!selectedAnnotation || (selectedAnnotation.type !== 'highlight' && selectedAnnotation.type !== 'note')) {
 return (
  <div className="space-y-3">
  <div className="text-center py-8">
   <p className="text-4xl opacity-30 mb-3">Q</p>
   <p className="text-sm text-amber-700/50 dark:text-amber-400/40">
   {t('share_quote_empty')}
   </p>
  </div>
  </div>
 );
 }

 return (
 <div className="space-y-3">
  <p className="text-xs text-gray-500">
  {t('share_quote_desc')}
  </p>
  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-900/30">
  <p className="text-sm text-gray-700 italic line-clamp-4">
   {selectedAnnotation.content}
  </p>
  </div>
  <p className="text-xs text-gray-500">
  {t('share_quote_hint')}
  </p>
 </div>
 );
});
