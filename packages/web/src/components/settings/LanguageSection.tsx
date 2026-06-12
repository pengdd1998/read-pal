'use client';

import React from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface LanguageSectionProps {
  onLanguageChange: (locale: 'en' | 'zh') => void;
}

export const LanguageSection = React.memo(function LanguageSection({ onLanguageChange }: LanguageSectionProps) {
  const t = useTranslations('settings_page');
  const tc = useTranslations('common');
  const locale = useLocale();

  return (
    <section className="mb-6 animate-slide-up stagger-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40 flex items-center justify-center">
          <svg aria-hidden="true" className="w-[1.125rem] h-[1.125rem] text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold">{t('language_title')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('language_desc')}</p>
        </div>
      </div>
      <div className="bg-surface-0 rounded-2xl border border-surface-3 p-4">
        <div className="flex gap-2">
          <LanguageButton
            label={tc('english')}
            isActive={locale === 'en'}
            onClick={() => onLanguageChange('en')}
          />
          <LanguageButton
            label={tc('chinese')}
            isActive={locale === 'zh'}
            onClick={() => onLanguageChange('zh')}
          />
        </div>
      </div>
    </section>
  );
});

interface LanguageButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const LanguageButton = React.memo(function LanguageButton({ label, isActive, onClick }: LanguageButtonProps) {
  return (
    <button type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`flex-1 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
        isActive
          ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-2 border-violet-300 dark:border-violet-700'
          : 'bg-surface-2 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
});
