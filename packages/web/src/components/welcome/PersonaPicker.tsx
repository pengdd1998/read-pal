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

interface PersonaPickerProps {
  personas: readonly PersonaInfo[];
  selectedPersona: string;
  onSelect: (id: string) => void;
}

export const PersonaPicker = React.memo(function PersonaPicker({
  personas,
  selectedPersona,
  onSelect,
}: PersonaPickerProps) {
  const t = useTranslations('welcome');

  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        {t('pick_companion')}
      </h3>
      <div className="grid grid-cols-1 gap-1.5 text-left">
        {personas.map((p) => {
          const isSelected = selectedPersona === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all duration-200 text-left min-h-[44px] ${
                isSelected
                  ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/15 ring-1 ring-amber-400/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-surface-2'
              }`}
            >
              <span className="text-xl">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">{t(p.personalityKey)}</span>
                </div>
              </div>
              {isSelected && (
                <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
