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
