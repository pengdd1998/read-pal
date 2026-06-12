'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { ChatPanelHeader } from './ChatPanelHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { type SanitizedMessage } from './useSanitizedMessages';

type CompanionMode = 'casual' | 'scholar' | 'socratic';
type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

interface ChatOpenPanelProps {
 friendEmoji: string;
 friendName: string;
 aiHealthy: boolean | null;
 companionMode: CompanionMode;
 onToggleMode: () => void;
 onClose: () => void;
 loading: boolean;
 connecting: boolean;
 hasStreamingMessage: boolean;
 sanitizedMessages: SanitizedMessage[];
 suggestedPrompts: string[];
 bookTitle?: string;
 input: string;
 onInputChange: (value: string) => void;
 onKeyDown: (e: React.KeyboardEvent) => void;
 onSend: () => void;
 onStop: () => void;
 submitFeedback: (messageId: string, rating: boolean) => void;
 t: TranslateFn;
}

export const ChatOpenPanel = React.memo(function ChatOpenPanel({
 friendEmoji,
 friendName,
 aiHealthy,
 companionMode,
 onToggleMode,
 onClose,
 loading,
 connecting,
 hasStreamingMessage,
 sanitizedMessages,
 suggestedPrompts,
 bookTitle,
 input,
 onInputChange,
 onKeyDown,
 onSend,
 onStop,
 submitFeedback,
 t,
}: ChatOpenPanelProps) {
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const chatContainerRef = useRef<HTMLDivElement>(null);

 // Auto-scroll
 const scrollToBottom = useCallback(() => {
 requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
 }, []);

 useEffect(() => { return scrollToBottom(); }, [sanitizedMessages, loading, connecting, scrollToBottom]);

 return (
 <>
  {/* Backdrop */}
  <div
  className="fixed inset-0 z-30 hidden md:block md:bg-black/10"
  onClick={onClose}
       tabIndex={-1}
       onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
/>

  {/* Mobile: bottom sheet — Desktop: sidebar */}
  <div
  role="dialog"
  aria-modal="true"
  aria-label={t('companion_aria_chat_with', { name: friendName })}
  className="fixed right-0 bottom-0 max-h-[40vh] md:max-h-none h-auto md:h-full w-full md:top-0 md:bottom-0 md:w-[400px] bg-surface-0 shadow-2xl z-40 flex flex-col rounded-t-2xl md:rounded-none animate-slide-in-up md:animate-slide-in-right overscroll-contain safe-area-bottom"
  >
  {/* Mobile drag handle */}
  <div className="flex justify-center pt-2 pb-1 md:hidden">
   <div className="w-10 h-1 rounded-full bg-surface-3" />
  </div>
  <ChatPanelHeader
   friendEmoji={friendEmoji}
   friendName={friendName}
   aiHealthy={aiHealthy}
   companionMode={companionMode}
   onToggleMode={onToggleMode}
   onClose={onClose}
   t={t}
  />

  <ChatMessageList
   messages={sanitizedMessages}
   loading={loading}
   connecting={connecting}
   hasStreamingMessage={hasStreamingMessage}
   friendEmoji={friendEmoji}
   friendName={friendName}
   bookTitle={bookTitle}
   suggestedPrompts={suggestedPrompts}
   messagesEndRef={messagesEndRef}
   chatContainerRef={chatContainerRef}
   onPromptClick={onInputChange}
   t={t}
   submitFeedback={submitFeedback}
  />

  <ChatInput
   input={input}
   loading={loading}
   onInputChange={onInputChange}
   onKeyDown={onKeyDown}
   onSend={onSend}
   onStop={onStop}
   t={t}
  />
  </div>
 </>
 );
});
