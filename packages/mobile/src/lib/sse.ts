/**
 * SSE Stream Consumer for React Native
 *
 * Adapted from web/src/lib/sse.ts — same protocol parsing,
 * uses fetch + ReadableStream supported by React Native.
 */

import { getToken } from './auth-storage';
import { API_URL } from './env';

export interface SSECallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export function consumeSSEStream(
  response: Response,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  const reader = response.body?.getReader();

  if (!reader) {
    callbacks.onError('No response body');
    return controller;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const processChunk = (chunk: string): void => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6);
      if (payload === '[DONE]') {
        callbacks.onDone();
        return;
      }

      try {
        const parsed = JSON.parse(payload) as { token?: string; content?: string; error?: string };
        if (parsed.error) {
          callbacks.onError(parsed.error);
          return;
        }
        const token = parsed.content || parsed.token;
        if (token) callbacks.onToken(token);
      } catch {
        // Ignore malformed JSON lines
      }
    }
  };

  (async () => {
    try {
      while (!controller.signal.aborted) {
        const result = await reader.read();
        if (result.done) break;
        processChunk(decoder.decode(result.value, { stream: true }));
      }
      callbacks.onDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        callbacks.onError(err instanceof Error ? err.message : 'Stream read failed');
      }
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}

/** Start an SSE streaming request — returns AbortController immediately, streams in background */
export function startSSEStream(
  url: string,
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();

  // Kick off async — caller gets the controller right away
  (async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_URL}${url}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        callbacks.onError(`HTTP ${response.status}`);
        return;
      }

      consumeSSEStream(response, callbacks);
    } catch (err) {
      if (!controller.signal.aborted) {
        callbacks.onError(err instanceof Error ? err.message : 'Stream failed');
      }
    }
  })();

  return controller;
}
