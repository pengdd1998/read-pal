'use client';

interface MobileSettingsSheetProps {
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  quietMode: boolean;
  fontFamily: string;
  lineHeight: number;
  onFontSizeChange: (size: number) => void;
  onThemeChange: (theme: 'light' | 'dark' | 'sepia') => void;
  onQuietModeChange: (quiet: boolean) => void;
  onFontFamilyChange: (font: string) => void;
  onLineHeightChange: (lh: number) => void;
  onClose: () => void;
}

const FONT_OPTIONS = [
  { value: 'system-ui', label: 'System' },
  { value: "'Literata', 'Source Serif 4', Georgia, serif", label: 'Serif' },
  { value: "'Inter', system-ui, sans-serif", label: 'Sans' },
  { value: "'Merriweather', Georgia, serif", label: 'Merri' },
];

export function MobileSettingsSheet({
  fontSize,
  theme,
  quietMode,
  fontFamily,
  lineHeight,
  onFontSizeChange,
  onThemeChange,
  onQuietModeChange,
  onFontFamilyChange,
  onLineHeightChange,
  onClose,
}: MobileSettingsSheetProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reading settings"
      className="fixed inset-0 z-40 sm:hidden bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl p-5 animate-scale-in overscroll-contain max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-4" />
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">Reading Settings</h3>

        {/* Font size */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-gray-600 dark:text-gray-300">Font Size</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
            >
              A-
            </button>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 min-w-[2rem] text-center">{fontSize}</span>
            <button
              onClick={() => onFontSizeChange(Math.min(32, fontSize + 2))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
            >
              A+
            </button>
          </div>
        </div>

        {/* Line height */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm text-gray-600 dark:text-gray-300">Line Height</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onLineHeightChange(Math.max(1.2, +(lineHeight - 0.15).toFixed(2)))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
            >
              -
            </button>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 min-w-[2.5rem] text-center">{lineHeight.toFixed(2)}</span>
            <button
              onClick={() => onLineHeightChange(Math.min(2.2, +(lineHeight + 0.15).toFixed(2)))}
              className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
            >
              +
            </button>
          </div>
        </div>

        {/* Font family */}
        <div className="mb-5">
          <span className="text-sm text-gray-600 dark:text-gray-300 block mb-2">Font</span>
          <div className="grid grid-cols-4 gap-2">
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.label}
                onClick={() => onFontFamilyChange(f.value)}
                className={`py-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                  fontFamily === f.value
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-300">Theme</span>
          <div className="flex gap-2">
            {(['light', 'sepia', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => onThemeChange(t)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-95 ${
                  theme === t
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {t === 'light' ? '\u2600\uFE0F Light' : t === 'sepia' ? '\uD83D\uDCD6 Sepia' : '\uD83C\uDF19 Dark'}
              </button>
            ))}
          </div>
        </div>

        {/* Quiet mode */}
        <div className="flex items-center justify-between mt-5">
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-300">Quiet Mode</span>
            <p className="text-[10px] text-gray-400 mt-0.5">Hide interruptions &amp; coaching</p>
          </div>
          <button
            onClick={() => onQuietModeChange(!quietMode)}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              quietMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
            role="switch"
            aria-checked={quietMode}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
              quietMode ? 'translate-x-5' : ''
            }`} />
          </button>
        </div>
      </div>
    </div>
  );
}
