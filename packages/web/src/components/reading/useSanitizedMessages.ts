'use client';

import { useMemo } from 'react';
import { renderSimpleMarkdown } from '@/lib/markdown';
import { purifySync } from '@/lib/dompurify';
import type { Message } from '@/hooks/useStreamingChat';

export interface SanitizedMessage extends Message {
  sanitized: string;
}

export function useSanitizedMessages(messages: Message[]): SanitizedMessage[] {
  return useMemo(() => {
    const cache = new Map<string, string>();
    return [...messages]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((msg) => {
        // Skip caching for streaming messages — content is still changing
        if (msg.role === 'assistant' && !msg.streaming && !cache.has(msg.id)) {
          cache.set(msg.id, purifySync(renderSimpleMarkdown(msg.content)));
        }
        // Streaming messages render directly without cache
        if (msg.streaming && msg.role === 'assistant') {
          return { ...msg, sanitized: purifySync(renderSimpleMarkdown(msg.content)) };
        }
        return { ...msg, sanitized: cache.get(msg.id) || '' };
      });
  }, [messages]);
}
