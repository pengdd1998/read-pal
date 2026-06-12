'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

interface WelcomeStepProps {
  onContinue: () => void;
}

export const WelcomeStep = React.memo(function WelcomeStep({ onContinue }: WelcomeStepProps) {
  const t = useTranslations('welcome');

  return (
    <div className="text-center">
      <div className="flex justify-center mb-6">
        <svg aria-hidden="true" className="w-16 h-16 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        {t('onboarding_welcome_title')}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto mb-8">
        {t('onboarding_welcome_desc')}
      </p>
      <button type="button"
        onClick={onContinue}
        className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {t('onboarding_lets_go')}
      </button>
    </div>
  );
});
