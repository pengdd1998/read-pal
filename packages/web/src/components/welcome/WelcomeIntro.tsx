'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface WelcomeIntroProps {
  personaEmoji: string;
  personaName: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const WelcomeIntro = React.memo(function WelcomeIntro({
  personaEmoji,
  personaName,
  loading,
  error,
  onRetry,
}: WelcomeIntroProps) {
  const t = useTranslations('welcome');

  return (
    <div className="transition-all duration-700 opacity-100 translate-y-0">
      {/* Persona avatar */}
      <div className="w-24 h-24 mx-auto mb-6 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-200 to-teal-200 dark:from-amber-800/40 dark:to-teal-800/40 rounded-3xl rotate-6 scale-95" />
        <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 rounded-3xl flex items-center justify-center shadow-sm">
          <span className="text-4xl">{personaEmoji}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400">
          <div aria-hidden="true" className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          {t('preparing')}
        </div>
      ) : error ? (
        <div className="space-y-4">
          <p role="alert" className="text-red-600 dark:text-red-400 text-lg">{error}</p>
          <button type="button"
            onClick={onRetry}
            className="btn btn-primary py-2 px-6 rounded-xl"
          >
            {t('retry')}
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-2">{t('greeting', { name: personaName })}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg leading-relaxed">
            {t('intro')}
          </p>
        </>
      )}
    </div>
  );
});
