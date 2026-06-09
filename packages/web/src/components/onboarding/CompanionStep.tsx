'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Check } from '@/components/icons';

interface PersonaInfo {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  readonly personalityKey: string;
  readonly descKey: string;
}

interface CompanionStepProps {
  personas: readonly PersonaInfo[];
  selectedPersona: string;
  personaName: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export const CompanionStep = React.memo(function CompanionStep({
  personas,
  selectedPersona,
  personaName,
  onSelect,
  onBack,
  onContinue,
}: CompanionStepProps) {
  const t = useTranslations('welcome');
  const tc = useTranslations('common');

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('onboarding_pick_title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('onboarding_pick_subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 mb-6">
        {personas.map((p) => {
          const isSelected = selectedPersona === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
                isSelected
                  ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-400/30'
                  : 'border-surface-3 hover:border-surface-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
              }`}
            >
              <span className="text-2xl">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{t(p.personalityKey)}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t(p.descKey)}</p>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {tc('back')}
        </button>
        <button
          onClick={onContinue}
          className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          {t('onboarding_continue_with', { name: personaName })}
        </button>
      </div>
    </div>
  );
});
