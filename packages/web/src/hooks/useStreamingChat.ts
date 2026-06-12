'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync } from '@/lib/dompurify';
import { generateId } from '@read-pal/shared';
import { authFetchWithRefresh } from '@/lib/auth-fetch';
import { warn } from '@/lib/logger';

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
  persona?: string;
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
    persona,
    onMessagesUpdate,
    createAssistantMessage,
    extractCodeBlocks,
    t,
  } = options;

  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

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
      if (!mountedRef.current) return;
      // Abort any previous stream before retrying
      abortRef.current?.abort();
      const fetchController = new AbortController();
      abortRef.current = fetchController;

      try {
        const response = await authFetchWithRefresh(`${API_BASE_URL}/api/agents/chat/stream`, {
          method: 'POST',
          signal: fetchController.signal,
          body: JSON.stringify({
            book_id: bookId,
            message: msg,
            context: {
              bookId,
              currentPage,
              totalPages: totalPages ?? 0,
              bookTitle: bookTitle ?? '',
              author: author ?? '',
              chapterContent: chapterContent ? purifySync(chapterContent).slice(0, 8000) : '',
              nearbyCode: extractCodeBlocks(chapterContent ?? ''),
              genres: genreMetadata,
              bookDescription,
              companionMode,
              persona,
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
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, delay);
              fetchController.signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new DOMException('Aborted', 'AbortError'));
              }, { once: true });
            }).catch((err) => { if (err instanceof DOMException && err.name === 'AbortError') return; throw err; });
            if (fetchController.signal.aborted) return;
            return attemptStream(attempt + 1);
          }
          const errorMsg = t('companion_server_error', { status: response.status });
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
          flushTimerRef.current = null;
        };
        consumeSSEStream(
          response,
          (tokenChunk: string) => {
            streamBuffer += tokenChunk;
            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(flushBuffer, 80);
            }
          },
          () => {
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
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
            if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              onMessagesUpdate((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: t('companion_connection_lost', { seconds: delay / 1000 }) }
                    : m,
                ),
              );
              setConnecting(false);
              retryTimerRef.current = setTimeout(() => {
                if (!mountedRef.current) return;
                setConnecting(true);
                attemptStream(attempt + 1);
              }, delay);
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
          fetchController.signal,
        );
      } catch (err) {
        warn('useStreamingChat: connection error (attempt %d)', attempt, err);
        if (attempt < MAX_RETRIES && !fetchController.signal.aborted) {
          const delay = Math.pow(2, attempt) * 1000;
          onMessagesUpdate((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: t('companion_network_error', { seconds: delay / 1000 }) }
                : m,
            ),
          );
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, delay);
            fetchController.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }).catch((err) => { if (err instanceof DOMException && err.name === 'AbortError') return; throw err; });
          if (fetchController.signal.aborted) return;
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
    persona,
    onMessagesUpdate,
    createAssistantMessage,
    extractCodeBlocks,
    t,
  ]);

  const stopStreaming = useCallback(() => {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    abortRef.current?.abort();
    abortRef.current = null;
    onMessagesUpdate((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setLoading(false);
    setConnecting(false);
  }, [onMessagesUpdate]);

  // Abort stream and clear timer on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
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
