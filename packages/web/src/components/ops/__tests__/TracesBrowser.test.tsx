/**
 * TracesBrowser tests (monitoring-upgrade P-B): filter application, row
 * click drills into the chain endpoint, pagination, copy-to-clipboard
 * (feeds the badcase-triage replay flow).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const apiGet = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

const authFetchMock = vi.fn();
vi.mock('@/lib/auth-fetch', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

import messages from '../../../../messages/zh.json';
import { TracesBrowser } from '../TracesBrowser';

const SPAN = (over: Record<string, unknown> = {}) => ({
  id: 'row-' + Math.random().toString(36).slice(2, 8),
  request_id: 'req0001',
  http_request_id: 'chain-9',
  ts: '2026-09-20T10:04:07.044+00:00',
  label: 'Daily insight',
  model: 'mimo-v2.5',
  provider: 'mimo',
  latency_ms: 27000,
  ttft_ms: 800,
  success: true,
  error_type: null,
  error_message: null,
  fallback_used: true,
  cache_hit: false,
  prompt_version: 'v1',
  tokens: { input: 100, output: 200, total: 300 },
  estimated_cost_usd: 0.0002,
  user: '86c30133',
  ...over,
});

const LIST = {
  total: 2,
  limit: 25,
  offset: 0,
  items: [
    SPAN({ id: 'row-1', http_request_id: 'chain-9', success: true, label: 'Daily insight' }),
    SPAN({ id: 'row-2', http_request_id: 'chain-8', success: false, error_type: 'rate_limit', provider: 'glm', label: 'companion.chat', fallback_used: false }),
  ],
};

const CHAIN = {
  http_request_id: 'chain-9',
  span_count: 2,
  chain_latency_ms: 85000,
  labels: ['Daily insight'],
  providers: ['glm', 'mimo'],
  has_fallback: true,
  all_success: false,
  spans: [
    SPAN({ id: 'span-1', provider: 'glm', success: false, error_type: 'rate_limit', fallback_used: false, latency_ms: 58000 }),
    SPAN({ id: 'span-2', provider: 'mimo', success: true, fallback_used: true, latency_ms: 27000 }),
  ],
};

function renderBrowser() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <TracesBrowser opsKey="test-ops-key" />
    </NextIntlClientProvider>,
  );
}

describe('TracesBrowser (P-B)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({ success: true, data: LIST });
  });

  it('loads the list with the ops-key header and default window', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Daily insight')).toBeTruthy());
    const [url, params, opts] = apiGet.mock.calls[0];
    expect(url).toBe('/api/v1/stats/llm/requests');
    expect(params).toMatchObject({ hours: 24, limit: 25, offset: 0 });
    expect(opts.headers['X-Ops-Key']).toBe('test-ops-key');
    expect(screen.getByText('共 2 行')).toBeTruthy();
  });

  it('failed-only toggle adds success=false and resets pagination', async () => {
    renderBrowser();
    await waitFor(() => expect(screen.getByText('Daily insight')).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('仅看失败'));
    await waitFor(() => {
      const [, params] = apiGet.mock.calls[apiGet.mock.calls.length - 1];
      expect(params).toMatchObject({ success: false });
    });
  });

  it('label filter is sent when non-empty', async () => {
    renderBrowser();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('按 label 过滤'), 'companion');
    await waitFor(() => {
      const [, params] = apiGet.mock.calls[apiGet.mock.calls.length - 1];
      expect(params).toMatchObject({ label: 'companion' });
    });
  });

  it('row click drills into the chain and renders span timeline', async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/requests/chain-9')) return { success: true, data: CHAIN };
      return { success: true, data: LIST };
    });
    renderBrowser();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Daily insight')).toBeTruthy());
    await user.click(screen.getAllByText('chain-9')[0].closest('tr')!);

    await waitFor(() => expect(screen.getByTestId('chain-panel')).toBeTruthy());
    // chain summary + fallback marker
    expect(screen.getByText(/2 个 span/)).toBeTruthy();
    expect(screen.getByText(/含 fallback/)).toBeTruthy();
    // both spans present, ordered oldest-first
    const texts = screen.getAllByText(/glm\/glm-4|glm\/mimo/);
    expect(texts.length).toBeGreaterThanOrEqual(2);
  });

  it('copy button writes the request id to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/requests/chain-9')) return { success: true, data: CHAIN };
      return { success: true, data: LIST };
    });
    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <TracesBrowser opsKey="test-ops-key" copyImpl={writeText} />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Daily insight')).toBeTruthy());
    await user.click(screen.getAllByText('chain-9')[0].closest('tr')!);
    await waitFor(() => expect(screen.getByTestId('chain-panel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '复制 ID' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('chain-9'));
    await waitFor(() => expect(screen.getByText('已复制')).toBeTruthy());
  });

  it('pagination renders when total exceeds the page size', async () => {
    apiGet.mockResolvedValue({ success: true, data: { ...LIST, total: 60 } });
    renderBrowser();
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeTruthy());
    act(() => { screen.getByText('→').click(); });
    await waitFor(() => {
      const [, params] = apiGet.mock.calls[apiGet.mock.calls.length - 1];
      expect(params).toMatchObject({ offset: 25 });
    });
  });
});

describe('TracesBrowser content panel (P-D)', () => {
  beforeEach(() => {
    apiGet.mockReset();
    authFetchMock.mockReset();
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/requests/chain-9')) return { success: true, data: CHAIN };
      return { success: true, data: LIST };
    });
  });

  async function openChain() {
    render(
      <NextIntlClientProvider locale="zh" messages={messages}>
        <TracesBrowser opsKey="test-ops-key" copyImpl={vi.fn().mockResolvedValue(undefined)} />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Daily insight')).toBeTruthy());
    await user.click(screen.getAllByText('chain-9')[0].closest('tr')!);
    await waitFor(() => expect(screen.getByTestId('chain-panel')).toBeTruthy());
    return user;
  }

  it('successful span fetches content lazily and renders I/O blocks', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {
        request_id: 'req0001', label: 'Daily insight', model: 'mimo-v2.5',
        prompt_version: 'v1', prompt_text: '[system] be helpful', output_text: 'the answer',
        prompt_truncated: true, output_truncated: false, created_at: '2026-09-24T01:00:00Z',
      } }),
    });
    await openChain();
    // span-2 is the successful span; span-1 failed earlier in the chain.
    fireEvent.click(screen.getByTestId('content-toggle-span-2'));

    await waitFor(() => expect(screen.getByTestId('content-panel-span-2')).toBeTruthy());
    const [url, init] = authFetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/stats/llm/requests/req0001/content?model=mimo-v2.5'); // 0034: model disambiguates fallback chains
    expect(init.headers['X-Ops-Key']).toBe('test-ops-key');
    expect(screen.getByText(/be helpful/)).toBeTruthy();
    expect(screen.getByText(/the answer/)).toBeTruthy();
    expect(screen.getByText('已截断')).toBeTruthy(); // prompt truncated badge
  });

  it('capture_disabled surfaces the enable banner', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: { reason: 'capture_disabled' } }),
    });
    await openChain();
    fireEvent.click(screen.getByTestId('content-toggle-span-2'));
    await waitFor(() => expect(screen.getByText(/LLM_TRACE_CONTENT_DB=true/)).toBeTruthy());
  });

  it('not_found shows the retention empty state', async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: { reason: 'not_found' } }),
    });
    await openChain();
    fireEvent.click(screen.getByTestId('content-toggle-span-2'));
    await waitFor(() => expect(screen.getByText('未捕获或已过保留期')).toBeTruthy());
  });

  it('cache-hit span skips the fetch entirely', async () => {
    const cachedChain = {
      ...CHAIN,
      spans: [SPAN({ id: 'span-c', cache_hit: true, success: true })],
    };
    apiGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/requests/chain-9')) return { success: true, data: cachedChain };
      return { success: true, data: LIST };
    });
    await openChain();
    fireEvent.click(screen.getByTestId('content-toggle-span-c'));
    await waitFor(() => expect(screen.getByText(/缓存命中/)).toBeTruthy());
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('failed span skips the fetch and explains why', async () => {
    await openChain();
    fireEvent.click(screen.getByTestId('content-toggle-span-1'));
    await waitFor(() => expect(screen.getByText(/失败调用/)).toBeTruthy());
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('toggle closes the panel without refetching', async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {
        request_id: 'req0001', label: 'l', model: 'm',
        prompt_version: null, prompt_text: 'p', output_text: 'o',
        prompt_truncated: false, output_truncated: false, created_at: null,
      } }),
    });
    await openChain();
    fireEvent.click(screen.getByTestId('content-toggle-span-2'));
    await waitFor(() => expect(screen.getByTestId('content-panel-span-2')).toBeTruthy());
    fireEvent.click(screen.getByTestId('content-toggle-span-2'));
    await waitFor(() => expect(screen.queryByTestId('content-panel-span-2')).toBeNull());
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });
});
