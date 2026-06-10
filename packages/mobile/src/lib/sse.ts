/**
 * SSE Stream Consumer for React Native
 *
 * React Native's `fetch` does NOT support ReadableStream — `response.body`
 * is always null for streaming responses.  We use XMLHttpRequest instead,
 * which supports progressive response handling via the `onprogress` event.
 */

import { getToken } from './auth-storage';
import { API_URL } from './env';

export interface SSECallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

/**
 * Start an SSE streaming request using XMLHttpRequest.
 * Returns an AbortController immediately; streams tokens in the background.
 */
export function startSSEStream(
  url: string,
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();

  (async () => {
    const token = await getToken();

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${url}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    let lastIndex = 0;
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
          const text = parsed.content || parsed.token;
          if (text) callbacks.onToken(text);
        } catch {
          // Ignore malformed JSON lines
        }
      }
    };

    xhr.onreadystatechange = () => {
      // HEADERS_RECEIVED
      if (xhr.readyState === 2) {
        if (xhr.status >= 400) {
          callbacks.onError(`HTTP ${xhr.status}`);
          controller.abort();
        }
      }
      // DONE
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Process any remaining data
          const remaining = xhr.responseText.slice(lastIndex);
          if (remaining.trim()) processChunk(remaining);
          callbacks.onDone();
        } else if (!controller.signal.aborted) {
          callbacks.onError(`HTTP ${xhr.status}`);
        }
      }
    };

    xhr.onprogress = () => {
      const newData = xhr.responseText.slice(lastIndex);
      lastIndex = xhr.responseText.length;
      if (newData) processChunk(newData);
    };

    xhr.onerror = () => {
      if (!controller.signal.aborted) {
        callbacks.onError('Network error');
      }
    };

    xhr.ontimeout = () => {
      if (!controller.signal.aborted) {
        callbacks.onError('Request timed out');
      }
    };

    xhr.timeout = 120_000;
    xhr.send(JSON.stringify(body));

    // Wire up abort
    controller.signal.addEventListener('abort', () => {
      xhr.abort();
    });
  })();

  return controller;
}

/**
 * @deprecated Use startSSEStream which now handles everything via XHR.
 */
export function consumeSSEStream(
  _response: Response,
  _callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  _callbacks.onError('consumeSSEStream is deprecated — use startSSEStream');
  return controller;
}
