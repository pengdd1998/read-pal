'use client';

import type { UserSettings } from '@/components/settings/types';

interface ReadingPrefsSectionProps {
  settings: UserSettings;
  saving: boolean;
  onSave: (updates: Partial<UserSettings>) => void;
}

const PERSONAS = [
  { id: 'sage', name: 'Sage', description: 'Wise and thoughtful', emoji: '\uD83E\uDDD9', color: 'from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30', accent: 'text-violet-600 dark:text-violet-400' },
  { id: 'penny', name: 'Penny', description: 'Enthusiastic and curious', emoji: '\u2728', color: 'from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30', accent: 'text-amber-600 dark:text-amber-400' },
  { id: 'alex', name: 'Alex', description: 'Challenging and direct', emoji: '\uD83C\uDFAF', color: 'from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30', accent: 'text-red-600 dark:text-red-400' },
  { id: 'quinn', name: 'Quinn', description: 'Calm and minimalist', emoji: '\uD83C\uDF43', color: 'from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30', accent: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'sam', name: 'Sam', description: 'Practical and focused', emoji: '\uD83D\uDCDA', color: 'from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30', accent: 'text-blue-600 dark:text-blue-400' },
];

function AppearanceCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium mb-2">Theme</label>
        <div className="grid grid-cols-3 gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onSave({ theme: t })}
              disabled={saving}
              aria-pressed={settings.theme === t}
              className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border ${
                settings.theme === t
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-xs'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="font-size-slider" className="text-sm font-medium">Font Size</label>
          <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium">
            {settings.fontSize}px
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
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>A</span>
          <span className="text-lg">A</span>
        </div>
      </div>

      {/* Font Family */}
      <div>
        <label className="block text-sm font-medium mb-2">Font Family</label>
        <div className="grid grid-cols-2 gap-2">
          {(['Inter', 'Georgia', 'Merriweather', 'system-ui'] as const).map((f) => (
            <button
              key={f}
              onClick={() => onSave({ fontFamily: f })}
              disabled={saving}
              aria-pressed={settings.fontFamily === f}
              className={`py-2.5 px-3 rounded-xl text-sm transition-all duration-200 active:scale-[0.98] border ${
                settings.fontFamily === f
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shadow-xs font-medium'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              style={{ fontFamily: f }}
            >
              {f === 'system-ui' ? 'System' : f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadingGoalsCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium mb-2">Books per week</label>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {[1, 2, 3, 5, 7].map((n) => (
              <button
                key={n}
                onClick={() => onSave({ readingGoal: n })}
                disabled={saving}
                aria-pressed={settings.readingGoal === n}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98] border ${
                  settings.readingGoal === n
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Reading Minutes */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="daily-minutes-slider" className="text-sm font-medium">Daily reading time</label>
          <span className="text-xs px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium">
            {settings.dailyReadingMinutes || 30} min
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
        />
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span>5 min</span>
          <span>1 hr</span>
          <span>2 hr</span>
        </div>
      </div>
    </div>
  );
}

function ReadingFriendCard({ settings, saving, onSave }: ReadingPrefsSectionProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
      {/* Persona selection */}
      <div>
        <label className="block text-sm font-medium mb-3">Choose your companion</label>
        <div className="grid grid-cols-1 gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => onSave({ friendPersona: p.id })}
              disabled={saving}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.98] ${
                settings.friendPersona === p.id
                  ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0`}>
                <span className="text-lg">{p.emoji}</span>
              </div>
              <div className="text-left">
                <div className="font-medium text-sm">{p.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{p.description}</div>
              </div>
              {settings.friendPersona === p.id && (
                <svg className="w-5 h-5 text-amber-500 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label className="block text-sm font-medium mb-2">Interaction frequency</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['minimal', 'Quiet', 'Only when asked'],
            ['normal', 'Friendly', 'Helpful nudges'],
            ['frequent', 'Active', 'Always nearby'],
          ] as const).map(([value, label, desc]) => (
            <button
              key={value}
              onClick={() => onSave({ friendFrequency: value })}
              disabled={saving}
              className={`py-3 px-2 rounded-xl text-center transition-all duration-200 active:scale-[0.98] border ${
                settings.friendFrequency === value
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 shadow-xs'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className={`text-sm font-medium ${settings.friendFrequency === value ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}>
                {label}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReadingPrefsSection({ settings, saving, onSave }: ReadingPrefsSectionProps) {
  return (
    <>
      {/* Appearance Section */}
      <section className="mb-6 animate-slide-up stagger-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center">
            <svg className="w-[1.125rem] h-[1.125rem] text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Appearance</h2>
        </div>
        <AppearanceCard settings={settings} saving={saving} onSave={onSave} />
      </section>

      {/* Reading Goals Section */}
      <section className="mb-6 animate-slide-up stagger-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-900/40 dark:to-emerald-900/40 flex items-center justify-center">
            <svg className="w-[1.125rem] h-[1.125rem] text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Reading Goals</h2>
        </div>
        <ReadingGoalsCard settings={settings} saving={saving} onSave={onSave} />
      </section>

      {/* Reading Friend Section */}
      <section className="mb-6 animate-slide-up stagger-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-teal-100 dark:from-amber-900/40 dark:to-teal-900/40 flex items-center justify-center">
            <span className="text-lg">{'\u2728'}</span>
          </div>
          <h2 className="text-lg font-semibold">Reading Friend</h2>
        </div>
        <ReadingFriendCard settings={settings} saving={saving} onSave={onSave} />
      </section>
    </>
  );
}
