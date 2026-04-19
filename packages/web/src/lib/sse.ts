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
): AbortController {
  const controller = new AbortController();
  const reader = response.body?.getReader();

  if (!reader) {
    onError('No response body');
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
        onDone();
        return;
      }

      try {
        const parsed = JSON.parse(payload) as { token?: string; content?: string; error?: string };
        if (parsed.error) {
          onError(parsed.error);
          return;
        }
        const token = parsed.content || parsed.token;
        if (token) {
          onToken(token);
        }
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
      // If stream ended without [DONE], still finalize
      onDone();
    } catch (err) {
      if (!controller.signal.aborted) {
        onError(err instanceof Error ? err.message : 'Stream read failed');
      }
    } finally {
      reader.releaseLock();
    }
  })();

  return controller;
}
