/**
 * Tests for the SSE stream consumer.
 *
 * D4: pins that the parser captures ``id:`` lines via the ``onId`` callback,
 * so the streaming hook can store the most recent id and send it back as
 * ``Last-Event-ID`` on reconnect (resuming the stream from the right offset
 * via D1 + D2 + D3).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consumeSSEStream } from '../sse';

// Build a Response-like object whose body yields the provided chunks.
function makeResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe('consumeSSEStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('captures id lines via onId callback (D1 + D4 round-trip)', async () => {
    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();
    const onMeta = vi.fn();
    const onId = vi.fn();

    const response = makeResponse([
      'id: req_abc:1\ndata: {"content":"hello"}\n\n',
      'id: req_abc:2\ndata: {"content":" world"}\n\n',
      'data: [DONE]\n\n',
    ]);

    consumeSSEStream(response, onToken, onDone, onError, undefined, onMeta, onId);

    // Drain the stream.
    await vi.runAllTimersAsync();

    expect(onId).toHaveBeenCalledTimes(2);
    expect(onId).toHaveBeenNthCalledWith(1, 'req_abc:1');
    expect(onId).toHaveBeenNthCalledWith(2, 'req_abc:2');
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not invoke onId when no id lines are present (backward compat)', async () => {
    const onId = vi.fn();
    const response = makeResponse([
      'data: {"content":"hi"}\n\n',
      'data: [DONE]\n\n',
    ]);

    consumeSSEStream(response, vi.fn(), vi.fn(), vi.fn(), undefined, vi.fn(), onId);
    await vi.runAllTimersAsync();

    expect(onId).not.toHaveBeenCalled();
  });

  it('still parses data lines following an id line', async () => {
    const onToken = vi.fn();
    const response = makeResponse([
      'id: req_abc:5\ndata: {"content":"payload"}\n\n',
      'data: [DONE]\n\n',
    ]);

    consumeSSEStream(response, onToken, vi.fn(), vi.fn(), undefined, vi.fn(), vi.fn());
    await vi.runAllTimersAsync();

    expect(onToken).toHaveBeenCalledWith('payload');
  });

  it('captures metadata id before metadata event id (sequence preserved)', async () => {
    /** D1 spec: metadata events also carry id lines. The parser must capture
     * each id in order — last call wins, so the most recent id is what the
     * client should replay from. */
    const onId = vi.fn();
    const response = makeResponse([
      'id: req_abc:1\ndata: {"type":"metadata","request_id":"req_abc","model":"glm"}\n\n',
      'id: req_abc:2\ndata: {"content":"first"}\n\n',
      'data: [DONE]\n\n',
    ]);

    consumeSSEStream(response, vi.fn(), vi.fn(), vi.fn(), undefined, vi.fn(), onId);
    await vi.runAllTimersAsync();

    expect(onId).toHaveBeenLastCalledWith('req_abc:2');
  });
});
