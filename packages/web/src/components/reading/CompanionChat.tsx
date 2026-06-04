'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { analytics } from '@/lib/analytics';
import { useToast } from '@/components/Toast';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { purifySync, preloadDOMPurify } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import {
  detectGenre,
  getGenreTemplate,
  getSocraticPrompts,
  shouldAutoOpen,
  type BookGenre,
} from '@/lib/companion-prompts';
import { extractCodeBlocks } from '@/lib/extract-code-blocks';
import { useCompanionPersona } from '@/hooks/useCompanionPersona';
import { useAiHealth } from '@/hooks/useAiHealth';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useDraggable } from '@/hooks/useDraggable';
import { useStreamingChat, type Message } from '@/hooks/useStreamingChat';
import { ChatFabButton } from './ChatFabButton';
import { ChatMessageList, type SanitizedMessage } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatPanelHeader } from './ChatPanelHeader';

export interface CompanionChatHandle {
  openWithMessage: (message: string) => void;
}

interface CompanionChatProps {
  bookId: string;
  currentPage: number;
  totalPages?: number;
  bookTitle?: string;
  author?: string;
  chapterContent?: string;
  genreMetadata?: string[] | string;
  bookDescription?: string;
  onReady?: (handle: CompanionChatHandle) => void;
}

export const CompanionChat = forwardRef<CompanionChatHandle, CompanionChatProps>(function CompanionChat({
  bookId,
  currentPage,
  totalPages,
  bookTitle,
  author,
  chapterContent,
  genreMetadata,
  bookDescription,
  onReady,
}, ref) {
  const { toast } = useToast();
  const t = useTranslations('reader');
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isFirstChat] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('read-pal-chat-opened');
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);

  const {
    friendName,
    friendEmoji,
    friendPersonaKey,
    companionMode,
    setCompanionMode,
  } = useCompanionPersona();

  const aiHealthy = useAiHealth();

  // Detect genre for adaptive behavior
  const genre: BookGenre = detectGenre(genreMetadata, bookTitle, bookDescription);
  const genreTemplate = getGenreTemplate(genre);

  // Chat history (loads from API, resets on book change)
  const { messages, setMessages } = useChatHistory({
    isOpen,
    bookId,
    friendName,
    bookTitle,
    genre,
    toast,
  });

  // --- Draggable floating button ---
  const {
    btnPos,
    isDragging,
    isSnapping,
    onDragStart,
    onDragMove,
    onDragEnd,
    wasDragRef,
    btnRef,
    snapTransition,
    dragRef,
  } = useDraggable({
    storageKey: 'read-pal-chat-btn-pos',
    btnSize: 56,
    edgeMargin: 20,
    headerMinY: 64,
  });

  // --- Streaming chat ---
  const createAssistantMessage = useCallback(() => generateId(), []);
  const {
    sendStreamMessage,
    loading,
    connecting,
    stopStreaming,
  } = useStreamingChat({
    bookId,
    currentPage,
    totalPages,
    bookTitle,
    author,
    chapterContent,
    genreMetadata,
    bookDescription,
    companionMode,
    persona: friendPersonaKey,
    onMessagesUpdate: setMessages,
    createAssistantMessage,
    extractCodeBlocks,
    t: t as (key: string, params?: Record<string, unknown>) => string,
  });

  // Preload DOMPurify on mount
  useEffect(() => { preloadDOMPurify(); }, []);

  // Check if any message is currently streaming
  const hasStreamingMessage = messages.some((m) => m.streaming);

  // Memoize sanitized assistant messages
  const sanitizedMessages = useMemo(() => {
    const cache = new Map<string, string>();
    return [...messages]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((msg) => {
        if (msg.role === 'assistant' && !cache.has(msg.id)) {
          cache.set(msg.id, purifySync(renderSimpleMarkdown(msg.content)));
        }
        return { ...msg, sanitized: cache.get(msg.id) || '' };
      });
  }, [messages]);

  // Expose imperative handle so parent can open chat with a pre-filled message
  useImperativeHandle(ref, () => ({
    openWithMessage: (message: string) => {
      pendingMessageRef.current = message;
      setIsOpen(true);
    },
  }), []);

  // Notify parent via callback
  useEffect(() => {
    if (onReady) {
      onReady({
        openWithMessage: (message: string) => {
          pendingMessageRef.current = message;
          setIsOpen(true);
        },
      });
    }
  }, [onReady]);

  // Auto-open chat for first-time readers after a brief delay
  useEffect(() => {
    if (!isFirstChat || !bookId) return;
    if (localStorage.getItem('read-pal-tour-complete') !== 'true') return;
    if (!shouldAutoOpen(genre)) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem('read-pal-chat-opened', 'true');
      const greeting = genreTemplate.greeting(friendName, bookTitle);
      setMessages([{
        id: generateId(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now(),
      }]);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isFirstChat, bookId, bookTitle, friendName, genre, genreTemplate]);

  // Mark chat as opened when user manually opens it
  const handleOpenChat = useCallback(() => {
    localStorage.setItem('read-pal-chat-opened', 'true');
    setIsOpen(true);
  }, []);

  // Auto-send pending message after chat opens
  useEffect(() => {
    if (isOpen && pendingMessageRef.current && !loading) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setInput(msg);
      const timer = setTimeout(() => sendStreamMessage(msg), 100);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sendStreamMessage]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, loading, connecting, scrollToBottom]);

  const toggleCompanionMode = useCallback(() => {
    const modes: Array<'casual' | 'scholar' | 'socratic'> = ['casual', 'scholar', 'socratic'];
    const idx = modes.indexOf(companionMode);
    const newMode = modes[(idx + 1) % modes.length];
    setCompanionMode(newMode);
    api.patch('/api/settings', { companionMode: newMode }).catch(() => {
      setCompanionMode(companionMode);
      toast(t('companion_mode_error'), 'error');
    });
  }, [companionMode, setCompanionMode]);

  // Send
  const handleSend = () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    analytics.track('ai_chat_sent');
    sendStreamMessage(msg);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const submitFeedback = useCallback(async (messageId: string, rating: boolean) => {
    try {
      await api.post('/api/agents/feedback', {
        book_id: bookId,
        message_id: messageId,
        rating,
      });
    } catch (err) {
      // Non-critical — log but don't disrupt the user
      console.error('[CompanionChat] Feedback submission failed:', err);
    }
  }, [bookId]);

  const suggestedPrompts = companionMode === 'socratic'
    ? getSocraticPrompts(bookTitle)
    : genreTemplate.suggestedPrompts(bookTitle);

  return (
    <>
      {!isOpen && (
        <ChatFabButton
          btnRef={btnRef}
          friendName={friendName}
          wasDragRef={wasDragRef}
          btnPos={btnPos}
          isDragging={isDragging}
          isSnapping={isSnapping}
          snapTransition={snapTransition}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          dragRef={dragRef}
          onOpen={handleOpenChat}
          ariaLabel={t('companion_aria_chat_with', { name: friendName })}
        />
      )}

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 hidden md:block md:bg-black/10"
            onClick={() => setIsOpen(false)}
          />

          {/* Mobile: bottom sheet — Desktop: sidebar */}
          <div
            className="fixed right-0 bottom-0 max-h-[40vh] md:max-h-none h-auto md:h-full w-full md:top-0 md:bottom-0 md:w-[400px] bg-surface-0 shadow-2xl z-40 flex flex-col rounded-t-2xl md:rounded-none animate-slide-in-up md:animate-slide-in-right overscroll-contain"
          >
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>
            <ChatPanelHeader
              friendEmoji={friendEmoji}
              friendName={friendName}
              aiHealthy={aiHealthy}
              companionMode={companionMode}
              onToggleMode={toggleCompanionMode}
              onClose={() => setIsOpen(false)}
              t={t as (key: string, params?: Record<string, unknown>) => string}
            />

            <ChatMessageList
              messages={sanitizedMessages as SanitizedMessage[]}
              loading={loading}
              connecting={connecting}
              hasStreamingMessage={hasStreamingMessage}
              friendEmoji={friendEmoji}
              friendName={friendName}
              bookTitle={bookTitle}
              suggestedPrompts={suggestedPrompts}
              messagesEndRef={messagesEndRef}
              chatContainerRef={chatContainerRef}
              onPromptClick={setInput}
              t={t as (key: string, params?: Record<string, unknown>) => string}
              submitFeedback={submitFeedback}
            />

            <ChatInput
              input={input}
              loading={loading}
              onInputChange={setInput}
              onKeyDown={handleKeyPress}
              onSend={handleSend}
              onStop={stopStreaming}
              t={t as (key: string, params?: Record<string, unknown>) => string}
            />
          </div>
        </>
      )}
    </>
  );
});
