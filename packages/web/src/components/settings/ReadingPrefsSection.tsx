'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import type { UserSettings } from '@/components/settings/types';

interface ReadingPrefsSectionProps {
 settings: UserSettings;
 saving: boolean;
 onSave: (updates: Partial<UserSettings>) => void;
}

const PERSONAS = [
 { id: 'sage', name: 'Sage', emoji: '🧙', color: 'from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30', accent: 'text-violet-600 dark:text-violet-400' },
 { id: 'penny', name: 'Penny', emoji: '✨', color: 'from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30', accent: 'text-amber-600 dark:text-amber-400' },
 { id: 'alex', name: 'Alex', emoji: '🎯', color: 'from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30', accent: 'text-red-600 dark:text-red-400' },
 { id: 'quinn', name: 'Quinn', emoji: '🍃', color: 'from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30', accent: 'text-emerald-600 dark:text-emerald-400' },
 { id: 'sam', name: 'Sam', emoji: '📚', color: 'from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30', accent: 'text-blue-600 dark:text-blue-400' },
] as const;

const AppearanceCard = React.memo(function AppearanceCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
 const t = useTranslations('settings');
 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-5">
  {/* Theme */}
  <fieldset>
  <legend className="block text-sm font-medium mb-2">{t('theme_label')}</legend>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   {(['system', 'light', 'dark'] as const).map((v) => (
   <button type="button"
    key={v}
    onClick={() => onSave({ theme: v })}
    disabled={saving}
    aria-pressed={settings.theme === v}
    className="min-h-[44px] py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    style={{
    backgroundColor: settings.theme === v ? undefined : '',
    borderColor: 'var(--surface-3)',
    }}
    >
    {v === 'system' ? t('theme_system') : v === 'light' ? t('theme_light') : t('theme_dark')}
    </button>
   ))}
  </div>
  </fieldset>

  {/* Font Size */}
  <div>
  <div className="flex items-center justify-between mb-2">
   <label htmlFor="font-size-slider" className="text-sm font-medium">{t('font_size_label')}</label>
   <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
   {t('font_size_px', { size: settings.fontSize })}
   </span>
  </div>
  <input
   id="font-size-slider"
   type="range"
   min="12"
   max="32"
   value={settings.fontSize}
   onChange={(e) => onSave({ fontSize: parseInt(e.target.value) })}
   className="w-full accent-amber-500"
   disabled={saving}
   aria-label={t('font_size_label')}
  />
  <div className="flex justify-between text-xs text-gray-500 mt-1">
   <span>A</span>
   <span className="text-lg">A</span>
  </div>
  </div>

  {/* Font Family */}
  <fieldset>
  <legend className="block text-sm font-medium mb-2">{t('font_family_label')}</legend>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   {(['Inter', 'Georgia', 'Merriweather', 'system-ui'] as const).map((f) => (
   <button type="button"
    key={f}
    onClick={() => onSave({ fontFamily: f })}
    disabled={saving}
    aria-pressed={settings.fontFamily === f}
    className="min-h-[44px] py-2.5 px-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.98] border focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    style={{ fontFamily: f }}
    >
    {f === 'system-ui' ? t('font_system') : f}
    </button>
   ))}
  </div>
  </fieldset>
 </div>
 );
});

const ReadingGoalsCard = React.memo(function ReadingGoalsCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
 const t = useTranslations('settings');
 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-5">
  <fieldset>
  <legend className="block text-sm font-medium mb-2">{t('books_per_week')}</legend>
  <div className="flex items-center gap-3">
   <div className="flex gap-1.5">
   {[1, 2, 3, 5, 7].map((n) => (
    <button type="button"
    key={n}
    onClick={() => onSave({ readingGoal: n })}
    disabled={saving}
    aria-pressed={settings.readingGoal === n}
    className="min-h-[44px] min-w-[44px] rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    style={{
    backgroundColor: settings.readingGoal === n ? undefined : '',
    borderColor: 'var(--surface-3)',
    }}
    >
    {n}
    </button>
   ))}
   </div>
  </div>
  </fieldset>

  {/* Daily Reading Minutes */}
  <div className="pt-4 border-t border-surface-2">
  <div className="flex items-center justify-between mb-2">
   <label htmlFor="daily-minutes-slider" className="text-sm font-medium">{t('daily_reading_time')}</label>
   <span className="text-xs px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium">
   {settings.dailyReadingMinutes || 30}{t('min_suffix')}
   </span>
  </div>
  <input
   id="daily-minutes-slider"
   type="range"
   min="5"
   max="120"
   step="5"
   value={settings.dailyReadingMinutes || 30}
   onChange={(e) => onSave({ dailyReadingMinutes: parseInt(e.target.value) })}
   className="w-full accent-teal-500"
   disabled={saving}
   aria-label={t('daily_reading_time')}
  />
  <div className="flex justify-between text-xs text-gray-500 mt-1">
   <span>5{t('min_suffix')}</span>
   <span>1{t('hr_suffix')}</span>
   <span>2{t('hr_suffix')}</span>
  </div>
  </div>
 </div>
 );
});

const ReadingFriendCard = React.memo(function ReadingFriendCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
 const t = useTranslations('settings');
 return (
 <div className="bg-surface-0 rounded-2xl border border-surface-3 p-6 space-y-5">
  {/* Persona selection */}
  <fieldset>
  <legend className="block text-sm font-medium mb-3">{t('choose_companion')}</legend>
  <div className="grid grid-cols-1 gap-2">
   {PERSONAS.map((p) => (
   <button type="button"
    key={p.id}
    onClick={() => onSave({ friendPersona: p.id })}
    disabled={saving}
    aria-pressed={settings.friendPersona === p.id}
    className={`flex items-center gap-3 p-3 min-h-[44px] rounded-xl border-2 transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
    settings.friendPersona === p.id
     ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
     : 'border-surface-3 hover:border-surface-2 bg-surface-1'
    }`}
   >
    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0`}>
    <span className="text-lg" aria-hidden="true">{p.emoji}</span>
    </div>
    <div className="text-left">
    <div className="font-medium text-sm">{p.name}</div>
    <div className="text-xs text-gray-500">{t(`persona_${p.id}_desc`)}</div>
    </div>
    {settings.friendPersona === p.id && (
    <svg aria-hidden="true" className="w-5 h-5 text-amber-500 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    )}
   </button>
   ))}
  </div>
  </fieldset>

  {/* Frequency */}
  <fieldset>
  <legend className="block text-sm font-medium mb-2">{t('interaction_frequency')}</legend>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   {([
   ['minimal', 'freq_minimal'],
   ['normal', 'freq_normal'],
   ['frequent', 'freq_frequent'],
   ] as const).map(([value, labelKey]) => (
   <button type="button"
    key={value}
    onClick={() => onSave({ friendFrequency: value })}
    disabled={saving}
    aria-pressed={settings.friendFrequency === value}
    className="min-h-[44px] py-3 px-2 rounded-xl text-center transition-all duration-200 active:scale-[0.98] border focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    style={{
    backgroundColor: settings.friendFrequency === value ? undefined : '',
    borderColor: 'var(--surface-3)',
    }}
    >
    <div className="text-sm font-medium">
    {t(labelKey)}
    </div>
    <div className="text-xs text-gray-500 mt-0.5">{t(`${labelKey}_desc`)}</div>
   </button>
   ))}
  </div>
  </fieldset>
 </div>
 );
});

export const ReadingPrefsSection = React.memo(function ReadingPrefsSection({ settings, saving, onSave }: ReadingPrefsSectionProps) {
 const t = useTranslations('settings_page');
 return (
 <>
  {/* Appearance Section */}
  <section className="mb-6 animate-slide-up stagger-1">
  <div className="flex items-center gap-3 mb-4">
   <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center">
   <svg aria-hidden="true" className="w-[1.125rem] h-[1.125rem] text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
   </svg>
   </div>
   <h2 className="text-lg font-semibold">{t('appearance_title')}</h2>
  </div>
  <AppearanceCard settings={settings} saving={saving} onSave={onSave} />
  </section>

  {/* Reading Goals Section */}
  <section className="mb-6 animate-slide-up stagger-2">
  <div className="flex items-center gap-3 mb-4">
   <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 flex items-center justify-center">
   <svg aria-hidden="true" className="w-[1.125rem] h-[1.125rem] text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
   </svg>
   </div>
   <h2 className="text-lg font-semibold">{t('reading_goals_title')}</h2>
  </div>
  <ReadingGoalsCard settings={settings} saving={saving} onSave={onSave} />
  </section>

  {/* Reading Friend Section */}
  <section className="mb-6 animate-slide-up stagger-3">
  <div className="flex items-center gap-3 mb-4">
   <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/40 dark:to-teal-900/40 flex items-center justify-center">
   <span className="text-lg">{'✨'}</span>
   </div>
   <h2 className="text-lg font-semibold">{t('reading_friend_title')}</h2>
  </div>
  <ReadingFriendCard settings={settings} saving={saving} onSave={onSave} />
  </section>
 </>
 );
});
