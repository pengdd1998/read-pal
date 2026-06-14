/**
 * SSE Stream Consumer
 *
 * Shared utility for consuming Server-Sent Events streams.
 * Extracted from CompanionChat, chat/page, and friend/page.
 */

/**
 * Consume an SSE stream from the backend.
 *
 * - `onToken` is called for each content chunk.
 * - `onMeta` is called for non-content metadata frames (e.g. ``request_id``).
 * - `onDone` is called when the stream completes ([DONE] or clean close).
 * - `onError` is called on stream errors, with the error string. The string
 *   ``'persist_failed'`` is special: it means the streamed content was
 *   produced but DB persistence failed — callers should NOT retry the stream
 *   in that case (the user already saw the response).
 *
 * Returns an AbortController so the caller can cancel.
 */
import { warn } from './logger';

export type SSEMeta = { request_id?: string };
export type SSEError = 'persist_failed' | 'internal_error' | (string & {});

export function consumeSSEStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: SSEError) => void,
  parentSignal?: AbortSignal,
  onMeta?: (meta: SSEMeta) => void,
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
  const safeError = (err: SSEError) => { if (!finalized) { finalized = true; onError(err); } };

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
        const parsed = JSON.parse(payload) as {
          token?: string;
          content?: string;
          error?: string;
          request_id?: string;
        };
        // Meta frame: request_id (and possibly other metadata). Emitted as
        // the first frame so the client can cancel the stream by id later.
        if (onMeta && (parsed.request_id !== undefined)) {
          onMeta({ request_id: parsed.request_id });
        }
        if (parsed.error) {
          safeError(parsed.error as SSEError);
          controller.abort();
          return;
        }
        const token = parsed.content || parsed.token;
        if (token) {
          onToken(token);
        }
      } catch (err) {
        warn('SSE: malformed JSON line:', payload, err);
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
        warn('SSE: stream read failed', err);
        safeError('Stream read failed');
      }
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}
