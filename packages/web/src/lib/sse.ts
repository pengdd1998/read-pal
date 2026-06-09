/**
 * SSE Stream Consumer
 *
 * Shared utility for consuming Server-Sent Events streams.
 * Extracted from CompanionChat, chat/page, and friend/page.
 */

/**
 * Consume an SSE stream from the backend, calling `onToken` for each token
 * chunk and `onDone` when the stream completes. Returns an AbortController
 * so the caller can cancel.
 */
export function consumeSSEStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  parentSignal?: AbortSignal,
): AbortController {
  const controller = new AbortController();
  const reader = response.body?.getReader();

  // Link parent signal so aborting the fetch also aborts the stream reader
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let finalized = false;
  const safeDone = () => { if (!finalized) { finalized = true; onDone(); } };
  const safeError = (err: string) => { if (!finalized) { finalized = true; onError(err); } };

  if (!reader) {
    safeError('No response body');
    return controller;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const processChunk = (chunk: string): void => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const payload = trimmed.slice(6); // strip "data: "
      if (payload === '[DONE]') {
        safeDone();
        controller.abort();
        return;
      }

      try {
        const parsed = JSON.parse(payload) as { token?: string; content?: string; error?: string };
        if (parsed.error) {
          safeError(parsed.error);
          controller.abort();
          return;
        }
        const token = parsed.content || parsed.token;
        if (token) {
          onToken(token);
        }
      } catch (err) {
        console.warn('SSE: malformed JSON line:', payload, err);
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
      // If stream ended without [DONE], still finalize
      safeDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('SSE: stream read failed', err);
        safeError('Stream read failed');
      }
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}
