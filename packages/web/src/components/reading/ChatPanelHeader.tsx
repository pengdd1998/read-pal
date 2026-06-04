'use client';

interface ChatPanelHeaderProps {
  friendEmoji: string;
  friendName: string;
  aiHealthy: boolean | null;
  companionMode: 'casual' | 'scholar' | 'socratic';
  onToggleMode: () => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function ChatPanelHeader({
  friendEmoji,
  friendName,
  aiHealthy,
  companionMode,
  onToggleMode,
  onClose,
  t,
}: ChatPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/50 dark:border-amber-900/30">
      <div className="flex items-center gap-2.5">
        <div className="relative w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-teal-500 text-sm shrink-0">
          {friendEmoji}
          {aiHealthy === false && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white dark:border-gray-800" title={t('companion_ai_slow')} />
          )}
          {aiHealthy === true && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white dark:border-gray-800" title={t('companion_ai_healthy')} />
          )}
        </div>
        <div>
          <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">{friendName}</h3>
          <p className="text-xs text-amber-600/70 dark:text-amber-400/60">{t('companion_your_reading_companion')}</p>
        </div>
      </div>
      <button
        onClick={onToggleMode}
        className={`min-w-[44px] min-h-[44px] rounded-lg text-xs font-medium transition-all flex items-center justify-center ${
          companionMode === 'socratic'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
            : companionMode === 'scholar'
              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title={companionMode === 'socratic' ? t('companion_mode_socratic_title') : companionMode === 'scholar' ? t('companion_mode_scholar_title') : t('companion_mode_casual_title')}
        aria-label={t('companion_aria_switch_mode', { mode: companionMode })}
      >
        {companionMode === 'socratic' ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ) : companionMode === 'scholar' ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>
      <button
        onClick={onClose}
        className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={t('companion_aria_close')}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
