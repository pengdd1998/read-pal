'use client';

import { useEffect, useRef, useImperativeHandle, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { generateId } from '@read-pal/shared';
import {
  getGenreTemplate,
  shouldAutoOpen,
  type BookGenre,
  type TranslateFn,
} from '@/lib/companion-prompts';
import type { Message } from '@/hooks/useStreamingChat';
import type { CompanionChatHandle } from './CompanionChat';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/safe-storage';

interface UseCompanionEffectsParams {
  ref: React.Ref<CompanionChatHandle>;
  onReady?: (handle: CompanionChatHandle) => void;
  isFirstChat: boolean;
  bookId: string;
  bookTitle?: string;
  friendName: string;
  genre: BookGenre;
  isOpen: boolean;
  loading: boolean;
  sendStreamMessage: (msg: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: (value: string) => void;
  setIsOpen: (value: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}

export function useCompanionEffects({
  ref,
  onReady,
  isFirstChat,
  bookId,
  bookTitle,
  friendName,
  genre,
  isOpen,
  loading,
  sendStreamMessage,
  setMessages,
  setInput,
  setIsOpen,
  t,
}: UseCompanionEffectsParams) {
  const pendingMessageRef = useRef<string | null>(null);
  const genreTemplate = getGenreTemplate(genre);
  const tp = t as unknown as TranslateFn;

  const openWithMessage = useCallback((message: string) => {
    pendingMessageRef.current = message;
    setIsOpen(true);
  }, [setIsOpen]);

  // Expose imperative handle so parent can open chat with a pre-filled message
  useImperativeHandle(ref, () => ({ openWithMessage }), [openWithMessage]);

  // Notify parent via callback
  useEffect(() => {
    if (onReady) {
      onReady({ openWithMessage });
    }
  }, [onReady, openWithMessage]);

  // Auto-open chat for first-time readers after a brief delay
  useEffect(() => {
    if (!isFirstChat || !bookId) return;
    if (safeGetItem('read-pal-tour-complete') !== 'true') return;
    if (!shouldAutoOpen(genre)) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
      safeSetItem('read-pal-chat-opened', 'true');
      const greeting = genreTemplate.greeting(tp, friendName, bookTitle);
      setMessages([{
        id: generateId(),
        role: 'assistant' as const,
        content: greeting,
        timestamp: Date.now(),
      }]);
    }, 2500);
    return () => clearTimeout(timer);
  }, [isFirstChat, bookId, bookTitle, friendName, genre, genreTemplate, setIsOpen, setMessages]);

  // Auto-send pending message after chat opens
  useEffect(() => {
    if (isOpen && pendingMessageRef.current && !loading) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      setInput(msg);
      const timer = setTimeout(() => sendStreamMessage(msg), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loading, sendStreamMessage]);

  return { pendingMessageRef };
}
