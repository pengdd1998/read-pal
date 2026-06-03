'use client';

import { useTranslations } from 'next-intl';
import type { DiscussionMessage } from './types';

interface ClubDiscussionPanelProps {
  messages: DiscussionMessage[];
  newMessage: string;
  onNewMessageChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  currentUserRole: string | null;
}

export function ClubDiscussionPanel({
  messages,
  newMessage,
  onNewMessageChange,
  onSend,
  sending,
  currentUserRole,
}: ClubDiscussionPanelProps) {
  const t = useTranslations('bookClubs');

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-surface-0 p-6 shadow-sm mb-6">
      <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <span className="text-lg">{'💬'}</span>
        {t('discussion')}
      </h2>

      {/* Messages */}
      <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
            {t('noMessages')}
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0">
              {(msg.author?.name || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {msg.author?.name || t('memberName')}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(msg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap break-words">
                {msg.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      {currentUserRole && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={t('discussionPlaceholder')}
            aria-label={t('discussionPlaceholder')}
            value={newMessage}
            onChange={(e) => onNewMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            maxLength={2000}
            disabled={sending}
          />
          <button
            onClick={onSend}
            disabled={sending || !newMessage.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {sending ? '...' : t('send')}
          </button>
        </div>
      )}
    </div>
  );
}
