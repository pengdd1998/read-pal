'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { api } from '@/lib/api';
import { consumeSSEStream } from '@/lib/sse';
import { purifySync } from '@/lib/dompurify';
import { generateId, randomIdempotencyKey } from '@read-pal/shared';
import { authFetchWithRefresh } from '@/lib/auth-fetch';
import { warn } from '@/lib/logger';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  persistFailed?: boolean;
}

/** Custom event dispatched when an optimistic turn is rolled back (stream
 * failure or persist_failed). CompanionChat listens for this to refill the
 * input box with the user's original text so they can retry with one keystroke. */
export const ROLLBACK_EVENT = 'companion-rollback';
export interface RollbackDetail { text: string }

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
  /** C3: fired when the server signals a fallback model took over mid-stream.
   * Caller surfaces this as a non-blocking notice (e.g. toast) so the user
   * attributes the response style change correctly instead of blaming the
   * book / their prompt. */
  onFallbackNotice?: (info: {
    model: string;
    primaryModel?: string;
    primaryProvider?: string;
  }) => void;
}

export interface UseStreamingChatReturn {
  sendStreamMessage: (msg: string, retryCount?: number) => Promise<void>;
  regenerate: () => Promise<void>;
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
    onFallbackNotice,
  } = options;

  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Track the current stream's request_id so stopStreaming can issue a
  // server-side cancel. The id is sent in the first SSE frame from /chat/stream.
  const currentRequestIdRef = useRef<string | null>(null);
  // D4: most recent SSE ``id:`` value seen on the current stream. Sent back
  // as ``Last-Event-ID`` on retry so the server replays buffered chunks from
  // the right offset (D1 + D2 + D3). Reset to null at the start of each
  // fresh logical call (sendStreamMessage / regenerate); preserved across
  // retries within the same call so reconnect resumes correctly.
  const lastEventIdRef = useRef<string | null>(null);

  /** Roll back an optimistic user+assistant turn and dispatch a rollback
   * event with the user's original text so the caller can pre-fill the input. */
  const rollbackTurn = useCallback((userMsgId: string, assistantMsgId: string, text: string) => {
    onMessagesUpdate((prev) => prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<RollbackDetail>(ROLLBACK_EVENT, { detail: { text } }));
    }
  }, [onMessagesUpdate]);

  /** Shared streaming runner. Posts to `endpoint` with `body`, streams tokens
   * into the assistant message `assistantMsgId`. On final failure, calls
   * `onFinalFailure` (for sendStreamMessage: rollback + dispatch event;
   * for regenerate: just clear the placeholder). */
  const runStream = useCallback(async (params: {
    endpoint: string;
    body: Record<string, unknown>;
    assistantMsgId: string;
    userMsgId?: string;
    rollbackText?: string;
    startAttempt?: number;
  }): Promise<void> => {
    const { endpoint, body, assistantMsgId, userMsgId, rollbackText, startAttempt = 0 } = params;

    // Generate ONE idempotency key per logical call so network retries
    // within this runStream invocation share the key (server dedupes them
    // as the same in-flight stream). A subsequent user click generates a
    // fresh key — important for regenerate, which must be allowed to fire
    // fresh even after a prior regenerate on the same body completed.
    const idempotencyKey = randomIdempotencyKey();

    // D4: reset Last-Event-ID tracking at the start of each logical call.
    // Retries within this call preserve the ref so reconnect resumes from
    // the right offset.
    lastEventIdRef.current = null;

    const attemptStream = async (attempt: number): Promise<void> => {
      if (!mountedRef.current) return;
      // Abort any previous stream before retrying
      abortRef.current?.abort();
      const fetchController = new AbortController();
      abortRef.current = fetchController;

      try {
        // D4: on retry (attempt > 0), include Last-Event-ID so the server
        // replays buffered chunks from the offset we last saw. Attempt 0
        // is a fresh request — no header.
        const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
        if (attempt > 0 && lastEventIdRef.current) {
          headers['Last-Event-ID'] = lastEventIdRef.current;
        }
        const response = await authFetchWithRefresh(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          signal: fetchController.signal,
          body: JSON.stringify(body),
          headers,
        });
        if (!response.ok) {
          if ((response.status >= 500 || response.status === 429) && attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            // D4: preserve partial content during reconnect. Only show the
            // "retrying" notice when no chunks were received yet — otherwise
            // replayed chunks would append to the placeholder, garbling the
            // rendered response.
            onMessagesUpdate((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                if (!m.content) {
                  return { ...m, content: t('companion_retrying', { seconds: delay / 1000 }) };
                }
                return m;
              }),
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
          // Final HTTP failure.
          if (attempt >= MAX_RETRIES && userMsgId && rollbackText !== undefined) {
            rollbackTurn(userMsgId, assistantMsgId, rollbackText);
          } else {
            const errorMsg = t('companion_server_error', { status: response.status });
            onMessagesUpdate((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: t('companion_error_prefix', { message: errorMsg }), streaming: false }
                  : m,
              ),
            );
          }
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

            // persist_failed: stream completed but DB save failed. The user
            // already saw the response. Don't retry — roll back the whole
            // turn so reload doesn't show a phantom message, and dispatch
            // a rollback event so CompanionChat can refill the input.
            if (errMsg === 'persist_failed') {
              if (mountedRef.current) {
                if (userMsgId && rollbackText !== undefined) {
                  rollbackTurn(userMsgId, assistantMsgId, rollbackText);
                } else {
                  // Regenerate path: just remove the placeholder.
                  onMessagesUpdate((prev) => prev.filter((m) => m.id !== assistantMsgId));
                }
                onMessagesUpdate((prev) => [
                  ...prev,
                  {
                    id: `err-${generateId()}`,
                    role: 'assistant' as const,
                    content: t('companion_persist_failed'),
                    timestamp: Date.now(),
                  },
                ]);
              }
              setLoading(false);
              setConnecting(false);
              abortRef.current = null;
              return;
            }

            if (attempt < MAX_RETRIES) {
              const delay = Math.pow(2, attempt) * 1000;
              // D4: preserve partial content during reconnect (see HTTP
              // retry branch above for rationale).
              onMessagesUpdate((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId) return m;
                  if (!m.content) {
                    return { ...m, content: t('companion_connection_lost', { seconds: delay / 1000 }) };
                  }
                  return m;
                }),
              );
              setConnecting(false);
              retryTimerRef.current = setTimeout(() => {
                if (!mountedRef.current) return;
                setConnecting(true);
                attemptStream(attempt + 1);
              }, delay);
              return;
            }
            // Final failure: roll back the optimistic user bubble and
            // dispatch a rollback event so the caller can pre-fill the
            // input with the user's original text.
            if (userMsgId && rollbackText !== undefined) {
              rollbackTurn(userMsgId, assistantMsgId, rollbackText);
            } else {
              // Regenerate path: clear placeholder.
              onMessagesUpdate((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: t('companion_stream_failed', { message: '' }), streaming: false }
                    : m,
                ),
              );
            }
            setLoading(false);
            setConnecting(false);
            abortRef.current = null;
          },
          fetchController.signal,
          (meta) => {
            // First frame from server: the request_id so we can cancel
            // cooperatively later.
            if (meta.request_id) {
              currentRequestIdRef.current = meta.request_id;
            }
            // C3: B3 quality-disclosure metadata event. Server emitted this
            // BEFORE the fallback chunks when primary failed mid-stream.
            // Surface via the caller's notice callback so the user gets a
            // non-blocking "fallback model took over" explanation.
            if (meta.type === 'metadata' && meta.fallback_used && onFallbackNotice) {
              onFallbackNotice({
                model: meta.model ?? '',
                primaryModel: meta.primary_model,
                primaryProvider: meta.primary_provider,
              });
            }
          },
          // D4: capture each ``id:`` line so reconnect can resume via
          // Last-Event-ID. The value is the raw ``{request_id}:{seq}``
          // string emitted by D1.
          (id: string) => {
            lastEventIdRef.current = id;
          },
        );
      } catch (err) {
        warn('useStreamingChat: connection error (attempt %d)', attempt, err);
        if (attempt < MAX_RETRIES && !fetchController.signal.aborted) {
          const delay = Math.pow(2, attempt) * 1000;
          // D4: preserve partial content during reconnect.
          onMessagesUpdate((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m;
              if (!m.content) {
                return { ...m, content: t('companion_network_error', { seconds: delay / 1000 }) };
              }
              return m;
            }),
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
        // Final network failure.
        if (attempt >= MAX_RETRIES && userMsgId && rollbackText !== undefined) {
          rollbackTurn(userMsgId, assistantMsgId, rollbackText);
        } else {
          onMessagesUpdate((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: t('companion_connect_failed'), streaming: false }
                : m,
            ),
          );
        }
        setLoading(false);
        setConnecting(false);
      }
    };

    await attemptStream(startAttempt);
  }, [onMessagesUpdate, t, rollbackTurn, onFallbackNotice]);

  const buildContext = useCallback(() => ({
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
  }), [
    bookId, currentPage, totalPages, bookTitle, author,
    chapterContent, genreMetadata, bookDescription, companionMode, persona,
    extractCodeBlocks,
  ]);

  const sendStreamMessage = useCallback(async (msg: string, retryCount = 0) => {
    const assistantMsgId = createAssistantMessage();
    const userMsgId = `opt-${generateId()}`;
    currentRequestIdRef.current = null;

    onMessagesUpdate((prev) => [
      ...prev,
      { id: userMsgId, role: 'user' as const, content: msg, timestamp: Date.now() },
      { id: assistantMsgId, role: 'assistant' as const, content: '', timestamp: Date.now(), streaming: true },
    ]);
    setLoading(true);
    setConnecting(true);

    await runStream({
      endpoint: '/api/agents/chat/stream',
      body: {
        book_id: bookId,
        message: msg,
        context: buildContext(),
      },
      assistantMsgId,
      userMsgId,
      rollbackText: msg,
      startAttempt: retryCount,
    });
  }, [bookId, createAssistantMessage, onMessagesUpdate, buildContext, runStream]);

  /** Regenerate the last assistant response. Server soft-deletes the prior
   * assistant message and re-streams a fresh one using the last user message
   * as the prompt. Locally, we drop the prior assistant bubble and stream
   * into a new placeholder. No optimistic user bubble needed. */
  const regenerate = useCallback(async () => {
    if (loading) return;
    const assistantMsgId = createAssistantMessage();
    currentRequestIdRef.current = null;

    // Drop the prior last assistant message locally (mirrors the server
    // soft-delete done by /chat/regenerate).
    onMessagesUpdate((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant' && !next[i].streaming) {
          next.splice(i, 1);
          break;
        }
      }
      next.push({
        id: assistantMsgId,
        role: 'assistant' as const,
        content: '',
        timestamp: Date.now(),
        streaming: true,
      });
      return next;
    });
    setLoading(true);
    setConnecting(true);

    await runStream({
      endpoint: '/api/agents/chat/regenerate',
      body: {
        book_id: bookId,
        context: buildContext(),
      },
      assistantMsgId,
    });
  }, [bookId, loading, createAssistantMessage, onMessagesUpdate, buildContext, runStream]);

  const stopStreaming = useCallback(() => {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    abortRef.current?.abort();
    abortRef.current = null;
    onMessagesUpdate((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setLoading(false);
    setConnecting(false);

    // Cooperatively cancel the in-flight stream on the server so the LLM
    // stops producing tokens and persist is skipped. Best-effort: a network
    // failure here is fine, the local abort above already stops the client.
    const reqId = currentRequestIdRef.current;
    if (reqId) {
      currentRequestIdRef.current = null;
      api.post('/api/agents/chat/cancel', { request_id: reqId }).catch((err) => {
        warn('useStreamingChat: cancel request failed (non-fatal)', err);
      });
    }
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
    regenerate,
    loading,
    connecting,
    stopStreaming,
    abortRef,
  };
}
