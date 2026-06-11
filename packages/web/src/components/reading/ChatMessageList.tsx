'use client';

import React from 'react';
import { ChatMessageBubble } from './ChatMessageBubble';

const BOUNCE_DOT_1 = { animationDuration: '0.6s' } as const;
const BOUNCE_DOT_2 = { animationDelay: '120ms', animationDuration: '0.6s' } as const;
const BOUNCE_DOT_3 = { animationDelay: '240ms', animationDuration: '0.6s' } as const;

interface SuggestedPromptButtonProps {
 prompt: string;
 onPromptClick: (prompt: string) => void;
}

const SuggestedPromptButton = React.memo(function SuggestedPromptButton({ prompt, onPromptClick }: SuggestedPromptButtonProps) {
 return (
  <button type="button"
   onClick={() => onPromptClick(prompt)}
   className="block w-full text-left text-xs p-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200/50 dark:border-amber-800/30 transition-colors focus-visible:ring-2 focus-visible:ring-amber-400"
  >
   {prompt}
  </button>
 );
});

export interface SanitizedMessage {
 id: string;
 role: 'user' | 'assistant';
 content: string;
 sanitized: string;
 streaming?: boolean;
}

interface ChatMessageListProps {
 messages: SanitizedMessage[];
 loading: boolean;
 connecting: boolean;
 hasStreamingMessage: boolean;
 friendEmoji: string;
 friendName: string;
 bookTitle?: string;
 suggestedPrompts: string[];
 messagesEndRef: React.Ref<HTMLDivElement>;
 chatContainerRef: React.Ref<HTMLDivElement>;
 onPromptClick: (prompt: string) => void;
 t: (key: string, params?: Record<string, unknown>) => string;
 submitFeedback: (messageId: string, rating: boolean) => void;
}

export const ChatMessageList = React.memo(function ChatMessageList({
 messages,
 loading,
 connecting,
 hasStreamingMessage,
 friendEmoji,
 friendName,
 bookTitle,
 suggestedPrompts,
 messagesEndRef,
 chatContainerRef,
 onPromptClick,
 t,
 submitFeedback,
}: ChatMessageListProps) {
 return (
 <div ref={chatContainerRef} role="log" aria-label={t('companion_aria_messages')} aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-3">
  {messages.length === 0 && !loading ? (
  <div className="text-center text-amber-700/60 dark:text-amber-300/50 py-10">
   <div className="text-3xl mb-3">{friendEmoji}</div>
   <p className="text-sm mb-1 font-medium text-amber-800 dark:text-amber-200">
   {bookTitle ? t('companion_chat_on_book', { name: friendName, title: bookTitle }) : t('companion_chat_with', { name: friendName })}
   </p>
   <p className="text-xs text-amber-600/60 dark:text-amber-400/40 mb-4">
   {t('companion_ask_anything')}
   </p>
   <div className="text-left space-y-2 max-w-xs mx-auto">
   {suggestedPrompts.map((q) => (
	    <SuggestedPromptButton
	    key={q}
	    prompt={q}
	    onPromptClick={onPromptClick}
	    />
	   ))}
   </div>
  </div>
  ) : (
  messages.map((msg) => (
   <ChatMessageBubble
   key={msg.id}
   msg={msg}
   t={t}
   submitFeedback={submitFeedback}
   />
  ))
  )}
  {loading && !hasStreamingMessage && (
  <div className="flex justify-start">
   <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 rounded-2xl rounded-bl-md px-4 py-3">
   <div className="flex gap-1.5 items-center">
    <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={BOUNCE_DOT_1} />
    <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={BOUNCE_DOT_2} />
    <div className="w-1.5 h-1.5 bg-amber-500/60 rounded-full animate-bounce" style={BOUNCE_DOT_3} />
    <span className="text-[10px] text-amber-500/80 ml-1">{connecting ? t('companion_connecting') : t('companion_thinking')}</span>
   </div>
   </div>
  </div>
  )}
  <div ref={messagesEndRef} />
 </div>
 );
});