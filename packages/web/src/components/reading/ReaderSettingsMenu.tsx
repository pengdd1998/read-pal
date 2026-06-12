'use client';

import React, { useMemo } from 'react';
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

export const ReaderSettingsMenu = React.memo(function ReaderSettingsMenu(props: ReaderSettingsMenuProps) {
  const {
    show, theme, fontSize, lineHeight, fontFamily, quietMode, bgEnabled,
    onClose, onFontSizeChange, onLineHeightChange, onFontFamilyChange,
    onThemeChange, onQuietModeChange, onBgEnabledChange, onShowShortcuts,
  } = props;
  const t = useTranslations('reader');

  const fontOptions = useMemo(() => [
    { value: 'system-ui', label: t('font_system') },
    { value: "'Literata', 'Source Serif 4', Georgia, serif", label: t('font_serif') },
    { value: "'Inter', system-ui, sans-serif", label: t('font_sans') },
    { value: "'Merriweather', Georgia, serif", label: t('font_merri') },
  ], [t]);

  if (!show) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
      <div
        className={`absolute right-0 top-full mt-1 z-50 w-72 max-h-[calc(100vh-80px)] overflow-y-auto rounded-xl shadow-xl border p-3 space-y-3 ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : theme === 'sepia' ? 'bg-[#f5f0e6] border-amber-200' : 'bg-white border-gray-200'
      }`}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        {/* Font size */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">{t('font_size_label')}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))} className="w-11 h-11 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={t('settings_decrease_font')}>A-</button>
            <div className="flex-1 h-1 bg-surface-2 rounded-full relative" role="slider" aria-valuenow={fontSize} aria-valuemin={12} aria-valuemax={32} aria-label={t('font_size_label')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onFontSizeChange(Math.min(32, fontSize + 2)); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onFontSizeChange(Math.max(12, fontSize - 2)); }}>
              <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((fontSize - 12) / 20) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-6 text-center">{fontSize}</span>
            <button type="button" onClick={() => onFontSizeChange(Math.min(32, fontSize + 2))} className="w-11 h-11 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={t('settings_increase_font')}>A+</button>
          </div>
        </div>

        {/* Line height */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">{t('line_height_label')}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onLineHeightChange(Math.max(1.2, +(lineHeight - 0.15).toFixed(2)))} className="w-11 h-11 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={t('settings_decrease_line_height')}>-</button>
            <div className="flex-1 h-1 bg-surface-2 rounded-full relative" role="slider" aria-valuenow={Math.round(lineHeight * 100)} aria-valuemin={120} aria-valuemax={220} aria-label={t('line_height_label')} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onLineHeightChange(Math.min(2.2, +(lineHeight + 0.15).toFixed(2))); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onLineHeightChange(Math.max(1.2, +(lineHeight - 0.15).toFixed(2))); }}>
              <div className="absolute left-0 top-0 h-full bg-amber-400 rounded-full" style={{ width: `${((lineHeight - 1.2) / 1.0) * 100}%` }} />
            </div>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 w-8 text-center">{lineHeight.toFixed(2)}</span>
            <button type="button" onClick={() => onLineHeightChange(Math.min(2.2, +(lineHeight + 0.15).toFixed(2)))} className="w-11 h-11 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1" aria-label={t('settings_increase_line_height')}>+</button>
          </div>
        </div>

        {/* Font family */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">{t('font_label')}</label>
          <div className="grid grid-cols-4 gap-1">
            {fontOptions.map((f) => (
              <button type="button"
                key={f.label}
                onClick={() => onFontFamilyChange(f.value)}
                aria-label={f.label}
                className={`py-2.5 rounded-lg text-[10px] font-medium transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
                  fontFamily === f.value
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 block">{t('theme_label')}</label>
          <div className="flex gap-1.5">
            {(['light', 'sepia', 'dark'] as const).map((themeVal) => (
              <button type="button"
                key={themeVal}
                onClick={() => onThemeChange(themeVal)}
                aria-label={themeVal === 'light' ? t('settings_light') : themeVal === 'sepia' ? t('settings_sepia') : t('settings_dark')}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
                  theme === themeVal
                    ? themeVal === 'light' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' : themeVal === 'dark' ? 'bg-amber-900/50 text-amber-200 ring-1 ring-amber-700' : 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                {themeVal === 'light' ? t('settings_light') : themeVal === 'sepia' ? t('settings_sepia') : t('settings_dark')}
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-1.5">
          <button type="button"
            onClick={() => onQuietModeChange(!quietMode)}
            aria-label={t('quiet_mode')}
            aria-pressed={quietMode}
            className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
              quietMode ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              {quietMode && <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />}
            </svg>
            {t('quiet_mode')}
          </button>
          <button type="button"
            onClick={() => onBgEnabledChange(!bgEnabled)}
            aria-label={t('bg_toggle')}
            aria-pressed={bgEnabled}
            className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 ${
              bgEnabled ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t('bg_toggle')}
          </button>
        </div>

        <button type="button"
          onClick={() => { onClose(); onShowShortcuts(); }}
          aria-label={t('keyboard_shortcuts')}
          className="w-full py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
        >
          {t('keyboard_shortcuts')} (?)
        </button>
      </div>
    </>
  );
});
