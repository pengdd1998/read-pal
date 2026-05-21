'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import { authFetch } from '@/lib/auth-fetch';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
}

export interface UseStreamingChatOptions {
  bookId: string;
  currentPage: number;
  totalPages?: number;
  bookTitle?: string;
  author?: string;
  chapterContent?: string;
  genreMetadata?: string[] | string;
  bookDescription?: string;
  companionMode: 'casual' | 'scholar' | 'socratic';
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  createAssistantMessage: () => string; // returns new message ID
  extractCodeBlocks: (html: string) => string;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export interface UseStreamingChatReturn {
  sendStreamMessage: (msg: string, retryCount?: number) => Promise<void>;
  loading: boolean;
  connecting: boolean;
  stopStreaming: () => void;
  abortRef: React.MutableRefObject<AbortController | null>;
}

const MAX_RETRIES = 2;

/**
 * Hook for managing SSE streaming chat with automatic retry, throttled
 * token buffering, and abort control.
 */
export function useStreamingChat(options: UseStreamingChatOptions): UseStreamingChatReturn {
  const {
    bookId,
    currentPage,
    totalPages,
    bookTitle,
    author,
    chapterContent,
    genreMetadata,
    bookDescription,
    companionMode,
    onMessagesUpdate,
    createAssistantMessage,
    extractCodeBlocks,
    t,
  } = options;

  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendStreamMessage = useCallback(async (msg: string, retryCount = 0) => {
    const assistantMsgId = createAssistantMessage();

    onMessagesUpdate((prev) => [
      ...prev,
      { id: generateId(), role: 'user' as const, content: msg, timestamp: Date.now() },
      { id: assistantMsgId, role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true },
    ]);
    setLoading(true);
    setConnecting(true);

    const attemptStream = async (attempt: number): Promise<void> => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/agents/chat/stream`, {
          method: 'POST',
          body: JSON.stringify({
            book_id: bookId,
            message: msg,
            context: {
              bookId,
              currentPage,
              totalPages: totalPages ?? 0,
              bookTitle: bookTitle ?? '',
              author: author ?? '',
              chapterContent: chapterContent ? purifySync(chapterContent).slice(0, 3000) : '',
              nearbyCode: extractCodeBlocks(chapterContent ?? ''),
              genres: genreMetadata,
              bookDescription,
              companionMode,
            },
          }),
        });
        if (!response.ok) {
          if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            onMessagesUpdate((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: t('companion_retrying', { seconds: delay / 1000 }) }
                  : m,
              ),
            );
            await new Promise((r) => setTimeout(r, delay));
            return attemptStream(attempt + 1);
          }
          let errorMsg = t('companion_server_error', { status: response.status });
          try {
            const errData = (await response.json()) as { error?: { message?: string } };
            errorMsg = errData.error?.message || errorMsg;
          } catch { /* use default */ }
          onMessagesUpdate((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: t('companion_error_prefix', { message: errorMsg }), streaming: false }
                : m,
            ),
          );
          setLoading(false);
          setConnecting(false);
          return;
        }

        setConnecting(false);
        // Throttled streaming: buffer tokens and flush to state every 80ms
        let streamBuffer = '';
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flushBuffer = () => {
          if (streamBuffer) {
            const chunk = streamBuffer;
            streamBuffer = '';
            onMessagesUpdate((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m,
              ),
            );
          }
          flushTimer = null;
        };
        abortRef.current = consumeSSEStream(
          response,
          (tokenChunk: string) => {
            streamBuffer += tokenChunk;
            if (!flushTimer) {
              flushTimer = setTimeout(flushBuffer, 80);
            }
          },
          () => {
            if (flushTimer) clearTimeout(flushTimer);
            flushBuffer();
            onMessagesUpdate((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, streaming: false, content: m.content || t('companion_no_response') }
                  : m,
              ),
            );
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
          (errMsg: string) => {
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              onMessagesUpdate((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: t('companion_connection_lost', { seconds: delay / 1000 }) }
                    : m,
                ),
              );
              setTimeout(() => attemptStream(attempt + 1), delay);
              return;
            }
            onMessagesUpdate((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content || t('companion_stream_failed', { message: errMsg }), streaming: false }
                  : m,
              ),
            );
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
        );
      } catch {
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000;
          onMessagesUpdate((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: t('companion_network_error', { seconds: delay / 1000 }) }
                : m,
            ),
          );
          await new Promise((r) => setTimeout(r, delay));
          return attemptStream(attempt + 1);
        }
        onMessagesUpdate((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: t('companion_connect_failed'), streaming: false }
              : m,
          ),
        );
        setLoading(false);
        setConnecting(false);
      }
    };

    await attemptStream(retryCount);
  }, [
    bookId,
    currentPage,
    totalPages,
    bookTitle,
    author,
    chapterContent,
    genreMetadata,
    bookDescription,
    companionMode,
    onMessagesUpdate,
    createAssistantMessage,
    extractCodeBlocks,
    t,
  ]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    onMessagesUpdate((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setLoading(false);
    setConnecting(false);
  }, [onMessagesUpdate]);

  // Abort stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    sendStreamMessage,
    loading,
    connecting,
    stopStreaming,
    abortRef,
  };
}
