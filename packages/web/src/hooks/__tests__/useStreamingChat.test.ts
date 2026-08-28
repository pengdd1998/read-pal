/**
 * Tests for useStreamingChat — mid-stream LLM fallback (B3).
 *
 * Pins the fallback contract: when the server emits the ``fallback_used``
 * metadata event mid-stream (it has already discarded the primary's partial
 * output before switching providers), the client must drop everything it
 * accumulated for the primary so the final visible text is fallback-only.
 * Covers the pending 80ms buffer, the already-flushed content, the
 * fallbackUsed flag, and Last-Event-ID replay after a fallback.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingChat, type Message } from '../useStreamingChat';

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://testserver',
  api: { post: vi.fn().mockResolvedValue({}) },
}));

const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({
  authFetchWithRefresh: (...args: unknown[]) => authFetchMock(...args),
}));

vi.mock('@/lib/dompurify', () => ({
  purifySync: (s: string) => s,
}));

let idCounter = 0;
vi.mock('@read-pal/shared', () => ({
  generateId: () => `id-${++idCounter}`,
  randomIdempotencyKey: () => 'idem-key',
}));

vi.mock('@/lib/logger', () => ({ warn: vi.fn() }));

/** Callbacks the hook registers with consumeSSEStream, captured per attempt
 * so tests can drive the SSE event sequence directly (the parser itself is
 * covered by lib/__tests__/sse.test.ts). */
interface CapturedStream {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onMeta: (meta: Record<string, unknown>) => void;
  onId: (id: string) => void;
}

const consumeSSEStreamMock = vi.fn();
vi.mock('@/lib/sse', () => ({
  consumeSSEStream: (...args: unknown[]) => consumeSSEStreamMock(...args),
}));

let attempts: CapturedStream[];

consumeSSEStreamMock.mockImplementation(
  (
    _response: Response,
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
    _parentSignal?: AbortSignal,
    onMeta?: (meta: Record<string, unknown>) => void,
    onId?: (id: string) => void,
  ) => {
    attempts.push({
      onToken,
      onDone,
      onError,
      onMeta: onMeta ?? (() => {}),
      onId: onId ?? (() => {}),
    });
    return new AbortController();
  },
);

/** B3 metadata frame as the server emits it (before fallback chunks). */
const FALLBACK_META = {
  type: 'metadata',
  request_id: 'req_1',
  model: 'glm-4-air',
  fallback_used: true,
  primary_model: 'glm-4.7-flash',
  primary_provider: 'zhipu',
};

function setup(preexisting: Message[] = []) {
  let messages: Message[] = preexisting;
  const onMessagesUpdate = (updater: (prev: Message[]) => Message[]) => {
    messages = updater(messages);
  };
  const onFallbackNotice = vi.fn();
  const assistantId = 'assistant-1';
  const { result } = renderHook(() =>
    useStreamingChat({
      bookId: 'book-1',
      currentPage: 1,
      companionMode: 'casual',
      onMessagesUpdate,
      createAssistantMessage: () => assistantId,
      extractCodeBlocks: () => '',
      t: (key: string) => key,
      onFallbackNotice,
    }),
  );
  const assistant = () => messages.find((m) => m.id === assistantId);
  /** Send a message and wait until the stream callbacks are captured. */
  const send = async (msg: string) => {
    await act(async () => {
      await result.current.sendStreamMessage(msg);
    });
  };
  return { send, assistant, allMessages: () => messages, onFallbackNotice };
}

describe('useStreamingChat — mid-stream fallback (B3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    attempts = [];
    idCounter = 0;
    authFetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 });
  });

  it('clears flushed primary text on fallback so final content is fallback-only', async () => {
    const { send, assistant, onFallbackNotice } = setup();
    await send('What themes?');

    // First frame (request_id), then primary tokens flushed to state.
    attempts[0].onMeta({ request_id: 'req_1' });
    attempts[0].onToken('Once upon a time');
    act(() => { vi.advanceTimersByTime(80); });
    expect(assistant()?.content).toBe('Once upon a time');

    // Fallback metadata: clears the primary prefix + flags the message.
    attempts[0].onMeta(FALLBACK_META);
    expect(assistant()?.content).toBe('');
    expect(assistant()?.fallbackUsed).toBe(true);

    // Fallback chunks append normally after the clear.
    attempts[0].onToken('I understand your question about');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onToken(' the themes.');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onDone();

    expect(assistant()?.content).toBe('I understand your question about the themes.');
    expect(assistant()?.streaming).toBe(false);
    expect(assistant()?.fallbackUsed).toBe(true);
    expect(onFallbackNotice).toHaveBeenCalledWith({
      model: 'glm-4-air',
      primaryModel: 'glm-4.7-flash',
      primaryProvider: 'zhipu',
    });
  });

  it('drops the pending unflushed buffer so a stale 80ms flush cannot re-append primary text', async () => {
    const { send, assistant } = setup();
    await send('hi');

    // Token buffered but NOT yet flushed (timer pending).
    attempts[0].onToken('Orphaned primary text');
    expect(assistant()?.content).toBe('');

    // Metadata arrives before the flush timer fires.
    attempts[0].onMeta(FALLBACK_META);
    act(() => { vi.advanceTimersByTime(80); }); // stale flush — must be a no-op
    expect(assistant()?.content).toBe('');

    attempts[0].onToken('Fallback answer');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onDone();

    expect(assistant()?.content).toBe('Fallback answer');
  });

  it('does not corrupt sibling messages when clearing the primary prefix', async () => {
    const prior: Message[] = [
      { id: 'u0', role: 'user', content: 'earlier question', timestamp: 1 },
      { id: 'a0', role: 'assistant', content: 'earlier answer', timestamp: 2 },
    ];
    const { send, assistant, allMessages } = setup(prior);
    await send('new question');

    attempts[0].onToken('partial');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onMeta(FALLBACK_META);
    attempts[0].onToken('fresh answer');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onDone();

    const all = allMessages();
    expect(all.find((m) => m.id === 'u0')?.content).toBe('earlier question');
    expect(all.find((m) => m.id === 'a0')?.content).toBe('earlier answer');
    expect(assistant()?.content).toBe('fresh answer');
  });

  it('leaves a normal stream untouched (no fallback metadata)', async () => {
    const { send, assistant, onFallbackNotice } = setup();
    await send('hello');

    attempts[0].onToken('Hello');
    attempts[0].onToken(' world');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onDone();

    expect(assistant()?.content).toBe('Hello world');
    expect(assistant()?.fallbackUsed).toBeUndefined();
    expect(onFallbackNotice).not.toHaveBeenCalled();
  });

  it('replay after fallback does not re-prepend cleared primary text', async () => {
    const { send, assistant, onFallbackNotice } = setup();
    await send('What themes?');

    // Attempt 0: primary chunks seen (id-tagged), then the connection drops
    // BEFORE the fallback metadata frame arrives.
    attempts[0].onId('req_1:1');
    attempts[0].onToken('Once upon a time');
    act(() => { vi.advanceTimersByTime(80); });
    expect(assistant()?.content).toBe('Once upon a time');
    attempts[0].onError('Stream read failed');

    // Retry fires after the backoff delay (2^0 * 1000ms).
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(attempts.length).toBe(2);
    // D4: the retry reconnects from the last seen id.
    const headers = authFetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers['Last-Event-ID']).toBe('req_1:1');

    // Reconnect: the server replays chunks after req_1:1 — worst case this
    // re-delivers primary text before the replayed metadata frame. The clear
    // is order-based, so the re-delivered primary text is discarded again.
    attempts[1].onToken('Once upon a time');
    attempts[1].onMeta(FALLBACK_META);
    attempts[1].onToken('Fresh replayed answer');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[1].onDone();

    expect(assistant()?.content).toBe('Fresh replayed answer');
    expect(assistant()?.fallbackUsed).toBe(true);
    expect(onFallbackNotice).toHaveBeenCalledTimes(1);
  });

  it('keeps the fallbackUsed flag when the message is finalized on done', async () => {
    const { send, assistant } = setup();
    await send('q');

    attempts[0].onMeta(FALLBACK_META);
    attempts[0].onToken('only fallback text');
    act(() => { vi.advanceTimersByTime(80); });
    attempts[0].onDone();

    const msg = assistant();
    expect(msg?.fallbackUsed).toBe(true);
    expect(msg?.content).toBe('only fallback text');
    expect(msg?.streaming).toBe(false);
  });
});
