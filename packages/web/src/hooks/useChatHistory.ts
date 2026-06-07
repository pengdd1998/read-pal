'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { generateId } from '@read-pal/shared';
import type { Message } from '@/hooks/useStreamingChat';
import type { BookGenre, TranslateFn } from '@/lib/companion-prompts';
import { getGenreTemplate } from '@/lib/companion-prompts';

interface UseChatHistoryOptions {
  isOpen: boolean;
  bookId: string;
  friendName: string;
  bookTitle?: string;
  genre: BookGenre;
  toast: (msg: string, type: 'error' | 'success' | 'info') => void;
  t: TranslateFn;
}

export function useChatHistory({
  isOpen,
  bookId,
  friendName,
  bookTitle,
  genre,
  toast,
  t,
}: UseChatHistoryOptions) {
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const prevBookIdRef = useRef(bookId);

  const genreTemplate = getGenreTemplate(genre);

  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    let cancelled = false;
    let greetTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const result = await api.get<Message[]>('/api/agents/history', { book_id: bookId, limit: 50 });
        if (!cancelled && result.success && result.data) {
          const raw = result.data;
          if (Array.isArray(raw) && raw.length > 0) {
            const history = raw
              .map((m) => ({ id: m.id || generateId(), role: m.role, content: m.content, timestamp: m.timestamp || Date.now() }))
              .sort((a, b) => a.timestamp - b.timestamp);
            setMessages(history);

            const lastMsg = history[history.length - 1];
            const isReturning = lastMsg && (Date.now() - lastMsg.timestamp > 30 * 60 * 1000);
            if (isReturning && lastMsg?.role === 'user') {
              const greeting = genreTemplate.returnGreeting(t, friendName);
              greetTimer = setTimeout(() => {
                if (!cancelled) {
                  setMessages((prev) => [...prev, {
                    id: generateId(),
                    role: 'assistant' as const,
                    content: greeting,
                    timestamp: Date.now(),
                  }]);
                }
              }, 800);
            }
          }
        }
      } catch { toast(t('companion_history_load_error'), 'error'); } finally { if (!cancelled) setHistoryLoaded(true); }
    };
    load();
    return () => {
      cancelled = true;
      if (greetTimer) clearTimeout(greetTimer);
    };
  }, [isOpen, bookId, historyLoaded, toast, genreTemplate, friendName, bookTitle, t]);

  // Reset on book change
  if (prevBookIdRef.current !== bookId) {
    prevBookIdRef.current = bookId;
    setHistoryLoaded(false);
    setMessages([]);
  }

  return { messages, setMessages, historyLoaded };
}
