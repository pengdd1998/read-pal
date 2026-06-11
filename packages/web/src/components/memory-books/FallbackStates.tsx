'use client';

import React from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface ErrorStateProps {
 error: string;
 onRetry: () => void;
}

interface EmptyCtaProps {
 onGenerate: () => void;
}

export const ErrorState = React.memo(function ErrorState({ error, onRetry }: ErrorStateProps) {
 const t = useTranslations('memoryBooks');

 return (
 <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
  <div className="text-5xl mb-4">{'\u{1F614}'}</div>
  <h2 className="text-xl font-bold text-gray-900 mb-2">{t('generationFailed')}</h2>
  <p className="text-sm text-gray-500 mb-6">{error}</p>
  <div className="flex gap-3 justify-center">
  <button type="button" onClick={onRetry} className="btn btn-primary">{t('tryAgain')}</button>
  <Link href="/memory-books" prefetch={false} className="btn bg-surface-1 text-gray-700">
   {t('backToMemoryBooks')}
  </Link>
  </div>
 </div>
 );
});

export const EmptyCta = React.memo(function EmptyCta({ onGenerate }: EmptyCtaProps) {
 const t = useTranslations('memoryBooks');

 return (
 <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in">
  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center">
  <span className="text-4xl">{'\u{1FA9E}'}</span>
  </div>
  <h2 className="text-xl font-bold text-gray-900 mb-2">{t('yourPersonalBook')}</h2>
  <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">{t('yourPersonalBookDesc')}</p>
  <button type="button"
  onClick={onGenerate}
  className="px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg hover:shadow-xl active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
  >
  {t('createButton')}
  </button>
  <div className="mt-6">
  <Link href="/memory-books" prefetch={false} className="text-sm text-gray-500 hover:text-gray-600 transition-colors">
   {t('backToMemoryBooks')}
  </Link>
  </div>
 </div>
 );
});