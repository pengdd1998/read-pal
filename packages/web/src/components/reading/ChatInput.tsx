'use client';

import React from 'react';

interface ChatInputProps {
 input: string;
 loading: boolean;
 onInputChange: (value: string) => void;
 onKeyDown: (e: React.KeyboardEvent) => void;
 onSend: () => void;
 onStop: () => void;
 t: (key: string, params?: Record<string, unknown>) => string;
}

export const ChatInput = React.memo(function ChatInput({
 input,
 loading,
 onInputChange,
 onKeyDown,
 onSend,
 onStop,
 t,
}: ChatInputProps) {
 return (
 <div className="p-3 border-t border-amber-200/50 dark:border-amber-900/30">
  <div className="flex gap-2">
  <textarea
   value={input}
   onChange={(e) => onInputChange(e.target.value)}
   onKeyDown={onKeyDown}
   placeholder={t('companion_placeholder')}
   aria-label={t('companion_aria_message')}
   className="flex-1 resize-none rounded-xl border border-amber-200 dark:border-amber-800/40 bg-surface-0 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
   rows={2}
   disabled={loading}
   maxLength={4000}
  />
  {loading ? (
   <button
   onClick={onStop}
   className="self-end shrink-0 px-3 py-2 rounded-lg bg-red-500/80 hover:bg-red-600 text-white text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
   {t('companion_stop')}
   </button>
  ) : (
   <button
   onClick={onSend}
   disabled={!input.trim()}
   aria-label={t('companion_aria_send')}
   className="btn self-end shrink-0 bg-gradient-to-r from-amber-500 to-teal-500 text-white hover:from-amber-600 hover:to-teal-600 shadow-soft disabled:opacity-50 focus-visible:outline-white"
   >
   <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
   </svg>
   </button>
  )}
  </div>
  {input.length > 3800 && (
  <p className={`text-xs mt-1 text-right ${input.length >= 4000 ? 'text-red-500' : 'text-gray-400'}`}>
   {input.length}/4000
  </p>
  )}
 </div>
 );
});
