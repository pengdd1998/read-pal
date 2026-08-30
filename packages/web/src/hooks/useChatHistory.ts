'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { warn } from '@/lib/logger';
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

interface RawHistoryItem {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  createdAt?: string;
}

interface CursorPage {
  items: RawHistoryItem[];
  nextCursor: string | null;
}

/** Parse the backend's ISO-8601 createdAt into an epoch ms timestamp. */
function parseTimestamp(raw: RawHistoryItem): number {
  if (typeof raw.timestamp === 'number') return raw.timestamp;
  if (raw.createdAt) {
    const ms = Date.parse(raw.createdAt);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

/**
 * Convert raw API items to Message shape, oldest-first.
 *
 * The API returns messages newest-first (created_at DESC). Within a
 * user/assistant pair the two rows are written in the same millisecond
 * burst, so a timestamp sort leaves the pair's internal order unstable
 * (ties compare 0) — history rendered with replies above their prompts.
 * Reversing the DESC array restores chronological order AND keeps each
 * pair's write order (user before assistant). Timestamp sort alone
 * cannot do this; array position is the tie-breaker that works.
 */
function toMessages(raw: RawHistoryItem[]): Message[] {
  return raw
    .map((m) => ({
      id: m.id || generateId(),
      role: m.role,
      content: m.content,
      timestamp: parseTimestamp(m),
    }))
    .reverse()
    // Safety net for mixed-page loads: sort ONLY when timestamps are
    // strictly out of order across second boundaries (pair ties stay
    // as-reversed via the stable sort's equal-compare no-op).
    .sort((a, b) => (a.timestamp === b.timestamp ? 0 : a.timestamp - b.timestamp));
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const prevBookIdRef = useRef(bookId);

  const genreTemplate = getGenreTemplate(genre);

  // Initial history load — flat list (no cursor) for backwards compatibility.
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
            const history = toMessages(raw as RawHistoryItem[]);
            setMessages(history);
            // Backwards-compat hint: when the API returns a full flat list
            // (no cursor key), there is no signal about whether more rows
            // exist on the server. The next page request will set hasMore
            // accurately. Optimistically assume there may be more if we
            // received exactly the page size.
            if (raw.length >= 50) {
              cursorRef.current = history[0]?.id ?? null;
              setHasMore(true);
            } else {
              setHasMore(false);
            }

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
      } catch (err) { warn('useChatHistory: load failed', err); toast(t('companion_history_load_error'), 'error'); } finally { if (!cancelled) setHistoryLoaded(true); }
    };
    load();
    return () => {
      cancelled = true;
      if (greetTimer) clearTimeout(greetTimer);
    };
  }, [isOpen, bookId, historyLoaded, toast, genreTemplate, friendName, bookTitle, t]);

  /** Load the next page of older messages using cursor pagination. */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const result = await api.get<CursorPage>('/api/agents/history', {
        book_id: bookId,
        limit: 50,
        before: cursorRef.current,
      });
      if (result.success && result.data) {
        const page = result.data as CursorPage;
        const olderMessages = toMessages(page.items || []);
        setMessages((prev) => {
          // Dedup by id (defensive: server shouldn't return dupes, but
          // the cursor boundary can theoretically overlap if our cached
          // cursor id raced a soft-delete).
          const existingIds = new Set(prev.map((m) => m.id));
          const fresh = olderMessages.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...prev];
        });
        cursorRef.current = page.nextCursor;
        setHasMore(Boolean(page.nextCursor));
      }
    } catch (err) {
      warn('useChatHistory: loadMore failed', err);
      toast(t('companion_history_load_error'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, bookId, toast, t]);

  // Reset history when the book changes. Doing this in an effect (rather
  // than during render) keeps the component pure under React Strict Mode
  // and avoids setState-during-render warnings. The first effect's
  // `historyLoaded` guard then re-opens the fetch on the new bookId.
  useEffect(() => {
    if (prevBookIdRef.current === bookId) return;
    prevBookIdRef.current = bookId;
    setHistoryLoaded(false);
    setMessages([]);
    setHasMore(false);
    cursorRef.current = null;
  }, [bookId]);

  return { messages, setMessages, historyLoaded, hasMore, loadingMore, loadMore };
}
