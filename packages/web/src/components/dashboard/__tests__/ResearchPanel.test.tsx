/**
 * ResearchPanel tests (matrix J1 + J2).
 *
 * The SSE parser itself is covered by lib/__tests__/sse.test.ts — here the
 * stream callbacks are captured so tests drive the frame sequence directly:
 * request_id → searching → sources → synthesizing → brief → done.
 * Cancellation asserts the /chat/cancel round-trip with the streamed
 * request_id.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const apiPost = vi.fn();
vi.mock('@/lib/api/client', () => ({
  API_BASE_URL: 'http://testserver',
  api: { post: (...args: unknown[]) => apiPost(...args) },
}));
const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({
  authFetchWithRefresh: (...args: unknown[]) => authFetchMock(...args),
}));
vi.mock('@read-pal/shared', () => ({
  randomIdempotencyKey: () => 'idem-key',
}));

/** Callbacks registered with consumeSSEStream for the latest submit. */
let streamMeta: ((meta: Record<string, unknown>) => void) | null = null;
let streamDone: (() => void) | null = null;
vi.mock('@/lib/sse', () => ({
  consumeSSEStream: vi.fn(
    (
      _response: unknown,
      _onToken: () => void,
      onDone: () => void,
      _onError: () => void,
      _parentSignal?: AbortSignal,
      onMeta?: (meta: Record<string, unknown>) => void,
    ) => {
      streamDone = onDone;
      streamMeta = onMeta ?? null;
      return new AbortController();
    },
  ),
}));
vi.mock('@/lib/logger', () => ({ warn: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import messages from '../../../../messages/zh.json';
import { ResearchPanel } from '../ResearchPanel';

const BRIEF = {
  summary: '两本书都以孤独为底色。',
  findings: [
    { claim: 'A 书写都市孤独', evidence: '引用原文片段', source_id: 1, book_title: 'A', chapter_title: '第一章' },
    { claim: 'B 书写流放孤独', evidence: '引用原文片段 2', source_id: 2, book_title: 'B', chapter_title: 'Chapter 2' },
  ],
  follow_ups: ['两位作者的背景差异？'],
  sources: [
    { source_id: 1, book_id: '11111111-1111-1111-1111-111111111111', book_title: 'A', author: '甲', chapter_title: '第一章' },
    { source_id: 2, book_id: '22222222-2222-2222-2222-222222222222', book_title: 'B', author: '乙', chapter_title: 'Chapter 2' },
  ],
  books_searched: 2,
};

const STREAM_SOURCES = [
  { source_id: 1, book_id: '11111111-1111-1111-1111-111111111111', book_title: 'A', author: '甲', chapter_title: '第一章' },
  { source_id: 2, book_id: '22222222-2222-2222-2222-222222222222', book_title: 'B', author: '乙', chapter_title: 'Chapter 2' },
];

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <ResearchPanel />
    </NextIntlClientProvider>,
  );
}

/** Submit a question and play the full happy-path frame sequence. */
async function submitAndStreamFullBrief(question: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), question);
  await user.click(screen.getByRole('button', { name: '提问' }));
  await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
  act(() => {
    streamMeta?.({ request_id: 'r-1' });
    streamMeta?.({ phase: 'searching' });
    streamMeta?.({ phase: 'sources', sources: STREAM_SOURCES, books_searched: 2 });
    streamMeta?.({ phase: 'synthesizing' });
    streamMeta?.({ brief: BRIEF });
    streamDone?.();
  });
  await waitFor(() => expect(screen.getByTestId('research-brief')).toBeTruthy());
}

describe('ResearchPanel (matrix J1/J2 — streaming)', () => {
  beforeEach(() => {
    apiPost.mockReset().mockResolvedValue({});
    authFetchMock.mockReset().mockResolvedValue({ ok: true });
    streamMeta = null;
    streamDone = null;
  });

  it('streams via the SSE endpoint and renders the cited brief', async () => {
    renderPanel();
    await submitAndStreamFullBrief('两本书的孤独写法差异');

    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('http://testserver/api/v1/agents/research/stream');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ question: '两本书的孤独写法差异' });
    expect(init.headers['Idempotency-Key']).toBe('idem-key');
    expect(screen.getByText('A 书写都市孤独')).toBeTruthy();
    expect(screen.getByText('两本书都以孤独为底色。')).toBeTruthy();
    // citation deep-links to the cited book
    const link = screen.getByRole('link', { name: /A · 第一章/ });
    expect(link.getAttribute('href')).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('shows progressive citations between the sources and brief phases', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '差异');
    await user.click(screen.getByRole('button', { name: '提问' }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      streamMeta?.({ request_id: 'r-1' });
      streamMeta?.({ phase: 'searching' });
    });
    await waitFor(() => expect(screen.getByText('正在检索你的书库…')).toBeTruthy());
    act(() => {
      streamMeta?.({ phase: 'sources', sources: STREAM_SOURCES, books_searched: 2 });
      streamMeta?.({ phase: 'synthesizing' });
    });
    // Citations visible before synthesis completes.
    await waitFor(() => expect(screen.getByTestId('research-progress-sources')).toBeTruthy());
    expect(screen.getByText('来源已就绪，正在综合分析…')).toBeTruthy();
  });

  it('cancel button round-trips /chat/cancel with the streamed request_id', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '差异');
    await user.click(screen.getByRole('button', { name: '提问' }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    act(() => streamMeta?.({ request_id: 'r-42' }));

    await user.click(screen.getByTestId('research-cancel'));
    expect(apiPost).toHaveBeenCalledWith('/api/v1/agents/chat/cancel', { request_id: 'r-42' });
    // Back to idle: the submit label replaces 取消.
    await waitFor(() => expect(screen.getByRole('button', { name: '提问' })).toBeTruthy());
  });

  it('follow-up chip re-submits with its question', async () => {
    renderPanel();
    await submitAndStreamFullBrief('差异');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '两位作者的背景差异？' }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
    const [, init2] = authFetchMock.mock.calls[1];
    expect(JSON.parse(init2.body)).toEqual({ question: '两位作者的背景差异？' });
  });

  it('empty library renders guidance, not an error', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '任何问题');
    await user.click(screen.getByRole('button', { name: '提问' }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      streamMeta?.({ brief: { summary: '', findings: [], follow_ups: [], sources: [], books_searched: 0 } });
      streamDone?.();
    });
    await waitFor(() => expect(screen.getByText(/还没有可检索的书/)).toBeTruthy());
  });

  it('degraded fallback (brief.error) still renders the partial brief with a warning', async () => {
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '差异');
    await user.click(screen.getByRole('button', { name: '提问' }));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      streamMeta?.({ brief: { ...BRIEF, error: 'AI analysis unavailable - showing partial results' } });
      streamDone?.();
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByTestId('research-brief')).toBeTruthy();
  });

  it('HTTP failure surfaces the error state', async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 503 });
    renderPanel();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox'), '差异');
    await user.click(screen.getByRole('button', { name: '提问' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('研究助手暂时不可用，请稍后再试。')).toBeTruthy();
  });

  it('submit disabled for too-short questions', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: '提问' })).toBeDisabled();
  });
});
