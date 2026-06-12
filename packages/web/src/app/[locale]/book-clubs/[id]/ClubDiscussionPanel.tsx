'use client';

import React, { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { DiscussionMessage } from './types';

interface ClubDiscussionPanelProps {
 messages: DiscussionMessage[];
 loading?: boolean;
 newMessage: string;
 onNewMessageChange: (value: string) => void;
 onSend: () => void;
 sending: boolean;
 currentUserRole: string | null;
 loadError: string | null;
 sendError: string | null;
 onClearSendError: () => void;
}

const MessageItem = React.memo(function MessageItem({
 msg,
 fallbackName,
}: {
 msg: DiscussionMessage;
 fallbackName: string;
}) {
 const locale = useLocale();
 const formattedDate = useMemo(() => {
  const d = new Date(msg.createdAt);
  return `${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
 }, [msg.createdAt, locale]);
 return (
  <div className="flex gap-3">
  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900/30 dark:to-primary-800/30 flex items-center justify-center text-xs font-bold text-primary-700 dark:text-primary-300 shrink-0">
   {(msg.author?.name || '?')[0].toUpperCase()}
  </div>
  <div className="flex-1 min-w-0">
   <div className="flex items-baseline gap-2">
   <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
    {msg.author?.name || fallbackName}
   </span>
   <span className="text-[10px] text-gray-500 dark:text-gray-400">{formattedDate}</span>
   </div>
   <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap break-words">
   {msg.content}
   </p>
  </div>
  </div>
 );
});

export const ClubDiscussionPanel = React.memo(function ClubDiscussionPanel({
 messages,
 loading,
 newMessage,
 onNewMessageChange,
 onSend,
 sending,
 currentUserRole,
 loadError,
 sendError,
 onClearSendError,
}: ClubDiscussionPanelProps) {
 const t = useTranslations('bookClubs');

 return (
 <div className="rounded-2xl border border-surface-2 bg-surface-0 p-6 shadow-sm mb-6">
  <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
  <svg aria-hidden="true" className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
  {t('discussion')}
  </h2>

  {/* Load error */}
  {loadError && (
  <div role="alert" className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
   {loadError}
  </div>
  )}

  {/* Messages */}
  <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
  {loading && (
   <div className="flex justify-center py-6">
   <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
   </div>
  )}
  {!loading && messages.length === 0 && (
   <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
   {t('noMessages')}
   </p>
  )}
  {messages.map((msg) => (
   <MessageItem key={msg.id} msg={msg} fallbackName={t('memberName')} />
  ))}
  </div>

  {/* Send error */}
  {sendError && (
  <div role="alert" className="mb-3 flex items-center gap-2 text-xs text-red-500">
   <span>{sendError}</span>
   <button type="button" onClick={onClearSendError} className="underline hover:text-red-700 min-h-[44px] inline-flex items-center focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 rounded">
    {t('dismiss')}
   </button>
  </div>
  )}

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
   className="flex-1 px-3 py-2 rounded-lg border border-surface-3 bg-surface-1 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
   maxLength={2000}
   disabled={sending}
   />
   <button type="button"
   onClick={onSend}
   disabled={sending || !newMessage.trim()}
   className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors shrink-0 min-h-[44px] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
   >
   {sending ? t('sending') : t('send')}
   </button>
  </div>
  )}
 </div>
 );
});