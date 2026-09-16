'use client';

/** Types & contracts for useStreamingChat (M3.2 3/3 layer 1).
 *
 * The hook implementation lives in ../useStreamingChat-impl — no, see
 * index re-export below; this module is the pure-type layer so panels
 * and tests can import contracts without pulling the streaming machine.
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  streaming?: boolean;
  persistFailed?: boolean;
  /** B3: set when the server disclosed a mid-stream provider fallback for
   * this response. Additive quality flag (mirrors persistFailed) so the UI
   * can badge the message — never mutates content. */
  fallbackUsed?: boolean;
  /** The user's thumbs state for this assistant message (history echo). */
  myRating?: boolean | null;
  /** Tool-phase footprint (2026-09-14): which tools the companion ran
   * before answering. Set from the tool_status SSE frame; additive,
   * never affects content. */
  toolTrace?: Array<{ tool?: string; ok?: boolean; latency_ms?: number }>;
  /** v2 action proposals (user-confirmed writes). Ephemeral: not
   * persisted, gone on reload by design. */
  proposals?: Array<{ id?: string; tool?: string; args?: Record<string, unknown>; preview?: string }>;
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

