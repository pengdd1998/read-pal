'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { PersonaIcon } from '@/components/onboarding/OnboardingWalkthrough';

interface ReadyStepProps {
  personaEmoji: string;
  personaName: string;
  saving: boolean;
  onFinish: () => void;
  onGoToWelcome: () => void;
}

export const ReadyStep = React.memo(function ReadyStep({
  personaEmoji,
  personaName,
  saving,
  onFinish,
  onGoToWelcome,
}: ReadyStepProps) {
  const t = useTranslations('welcome');
  const tc = useTranslations('common');

  return (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/30 dark:to-teal-900/30 flex items-center justify-center shadow-sm">
        {personaEmoji === '🦉' || personaEmoji === '🌊' ? <span className="text-4xl">{personaEmoji}</span> : <PersonaIcon type={personaEmoji} className="w-10 h-10 text-amber-600 dark:text-amber-400" />}
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        {t('onboarding_ready_title', { name: personaName })}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 max-w-sm mx-auto">
        {t('onboarding_ready_desc', { name: personaName })}
      </p>
      <div className="flex flex-col gap-3 max-w-xs mx-auto">
        <button
          onClick={onGoToWelcome}
          className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] text-center focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          {tc('getStarted')}
        </button>
        <button
          onClick={onFinish}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {saving ? t('onboarding_saving') : t('onboarding_skip_for_now')}
        </button>
      </div>
    </div>
  );
});
