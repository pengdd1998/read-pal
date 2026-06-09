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
      <div className="text-6xl mb-6">{'📚'}</div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
        {t('onboarding_welcome_title')}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto mb-8">
        {t('onboarding_welcome_desc')}
      </p>
      <button
        onClick={onContinue}
        className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
      >
        {t('onboarding_lets_go')}
      </button>
    </div>
  );
});
