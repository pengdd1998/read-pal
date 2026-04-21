'use client';

import { useTranslations } from 'next-intl';

interface ReaderSettingsMenuProps {
  show: boolean;
  theme: 'light' | 'dark' | 'sepia';
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  quietMode: boolean;
  bgEnabled: boolean;
  onClose: () => void;
  onFontSizeChange: (size: number) => void;
  onLineHeightChange: (height: number) => void;
  onFontFamilyChange: (family: string) => void;
  onThemeChange: (theme: 'light' | 'dark' | 'sepia') => void;
  onQuietModeChange: (quiet: boolean) => void;
  onBgEnabledChange: (enabled: boolean) => void;
  onShowShortcuts: () => void;
}

export function ReaderSettingsMenu(props: ReaderSettingsMenuProps) {
  const {
    show, theme, fontSize, lineHeight, fontFamily, quietMode, bgEnabled,
    onClose, onFontSizeChange, onLineHeightChange, onFontFamilyChange,
    onThemeChange, onQuietModeChange, onBgEnabledChange, onShowShortcuts,
  } = props;
  const t = useTranslations('reader');

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={`absolute right-0 top-full mt-1 z-50 w-64 rounded-xl shadow-xl border p-3 space-y-3 ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : theme === 'sepia' ? 'bg-[#f5f0e6] border-amber-200' : 'bg-white border-gray-200'
      }`}>
        {/* Font size */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">{t('font_size_label')}</label>
          <div className="flex items-center gap-2">
            <button onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">A-</button>
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full relative">
              <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((fontSize - 12) / 20) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-6 text-center">{fontSize}</span>
            <button onClick={() => onFontSizeChange(Math.min(32, fontSize + 2))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">A+</button>
          </div>
        </div>

        {/* Line height */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">{t('line_height_label')}</label>
          <div className="flex items-center gap-2">
            <button onClick={() => onLineHeightChange(Math.max(1.2, +(lineHeight - 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">-</button>
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full relative">
              <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((lineHeight - 1.2) / 1.0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-8 text-center">{lineHeight.toFixed(2)}</span>
            <button onClick={() => onLineHeightChange(Math.min(2.2, +(lineHeight + 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg text-xs text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center">+</button>
          </div>
        </div>

        {/* Font family */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">{t('font_label')}</label>
          <div className="grid grid-cols-4 gap-1">
            {[{ value: 'system-ui', label: t('font_system') }, { value: "'Literata', 'Source Serif 4', Georgia, serif", label: t('font_serif') }, { value: "'Inter', system-ui, sans-serif", label: t('font_sans') }, { value: "'Merriweather', Georgia, serif", label: t('font_merri') }].map((f) => (
              <button
                key={f.label}
                onClick={() => onFontFamilyChange(f.value)}
                className={`py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  fontFamily === f.value
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700'
                    : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5 block">{t('theme_label')}</label>
          <div className="flex gap-1.5">
            {(['light', 'sepia', 'dark'] as const).map((themeVal) => (
              <button
                key={themeVal}
                onClick={() => onThemeChange(themeVal)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  theme === themeVal
                    ? themeVal === 'light' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : themeVal === 'dark' ? 'bg-amber-900/50 text-amber-200 ring-1 ring-amber-700' : 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                    : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {themeVal === 'light' ? t('settings_light') : themeVal === 'sepia' ? t('settings_sepia') : t('settings_dark')}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-1.5">
          <button
            onClick={() => onQuietModeChange(!quietMode)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              quietMode ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              {quietMode && <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />}
            </svg>
            {t('quiet_mode')}
          </button>
          <button
            onClick={() => onBgEnabledChange(!bgEnabled)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              bgEnabled ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t('bg_toggle')}
          </button>
        </div>

        <button
          onClick={() => { onClose(); onShowShortcuts(); }}
          className="w-full py-2 rounded-lg text-xs text-gray-400 hover:text-gray-600 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          {t('keyboard_shortcuts')} (?)
        </button>
      </div>
    </>
  );
}
