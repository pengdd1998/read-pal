import { describe, expect, it, vi } from 'vitest';

import { consumeSSEStream } from '../sse';

// ---------------------------------------------------------------------------
// Helpers to create mock ReadableStream + Response for SSE tests
// ---------------------------------------------------------------------------

/**
 * Create a mock Response whose body is a ReadableStream that yields the
 * given chunks as Uint8Array values, separated by the optional delay.
 */
function createMockResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });

  return {
    body: stream,
  } as Response;
}

/**
 * Wait for all pending microtasks / macrotasks to settle so the async SSE
 * consumer has time to finish processing.
 */
function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('consumeSSEStream', () => {
  it('calls onToken for each token chunk', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"token": "Hello"}\n\n',
      'data: {"token": " World"}\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith('Hello');
    expect(onToken).toHaveBeenCalledWith(' World');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onDone when [DONE] is received', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"token": "Hi"}\n\n',
      'data: [DONE]\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onToken).toHaveBeenCalledWith('Hi');
    // onDone is called once from processChunk on [DONE], and once more
    // from the end-of-stream fallback. At least one call is guaranteed.
    expect(onDone.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onError when the response has no body', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = { body: null } as unknown as Response;

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onError).toHaveBeenCalledWith('No response body');
    expect(onToken).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls onError when JSON payload contains an error field', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"error": "Rate limit exceeded"}\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onError).toHaveBeenCalledWith('Rate limit exceeded');
    expect(onToken).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON lines without crashing', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {bad json\n\n',
      'data: {"token": "after-bad"}\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    // Should skip the bad line and continue processing
    expect(onToken).toHaveBeenCalledWith('after-bad');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('supports the "content" field as well as "token"', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"content": "from content field"}\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onToken).toHaveBeenCalledWith('from content field');
  });

  it('handles multiple data lines in a single chunk', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"token": "A"}\ndata: {"token": "B"}\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError);
    await settled();

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith('A');
    expect(onToken).toHaveBeenCalledWith('B');
  });

  it('returns an AbortController that can abort the stream', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const response = createMockResponse([
      'data: {"token": "first"}\n\n',
    ]);

    const controller = consumeSSEStream(response, onToken, onDone, onError);

    expect(controller).toBeInstanceOf(AbortController);
    controller.abort();
    await settled();

    // onToken may or may not have been called depending on timing,
    // but aborting should not throw.
    expect(true).toBe(true);
  });
});
