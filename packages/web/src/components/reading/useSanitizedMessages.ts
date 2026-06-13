'use client';

import { useMemo, useRef } from 'react';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { purifySync } from '@/lib/dompurify';
import type { Message } from '@/hooks/useStreamingChat';

export interface SanitizedMessage extends Message {
  sanitized: string;
}

export function useSanitizedMessages(
  messages: Message[],
  purifyReady = true,
): SanitizedMessage[] {
  // Persist cache across renders so completed messages don't get re-sanitized.
  const cacheRef = useRef<Map<string, string>>(new Map());

  return useMemo(() => {
    const cache = cacheRef.current;
    const result = [...messages]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((msg) => {
        // Streaming messages render fresh — content is still changing
        if (msg.streaming && msg.role === 'assistant') {
          return { ...msg, sanitized: purifySync(renderSimpleMarkdown(msg.content)) };
        }
        // Non-streaming assistant messages: cache by id so re-renders are cheap
        if (msg.role === 'assistant') {
          let sanitized = cache.get(msg.id);
          if (!sanitized) {
            sanitized = purifySync(renderSimpleMarkdown(msg.content));
            cache.set(msg.id, sanitized);
          }
          return { ...msg, sanitized };
        }
        // User messages have no markdown rendering
        return { ...msg, sanitized: '' };
      });

    // Prune cache entries for messages no longer in the list
    if (cache.size > result.length * 2) {
      const liveIds = new Set(result.map((m) => m.id));
      for (const id of cache.keys()) {
        if (!liveIds.has(id)) cache.delete(id);
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, purifyReady]);
}
