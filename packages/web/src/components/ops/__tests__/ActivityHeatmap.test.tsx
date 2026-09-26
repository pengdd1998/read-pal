/**
 * E4 activity heatmap: renders the weekly grid from daily-bucket series,
 * computes longest streak / daily avg / total, empty-state when no data.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const apiGet = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

import messages from '../../../../messages/zh.json';
import { ActivityHeatmap } from '../ActivityHeatmap';

const SERIES = {
  series: [
    { bucket: '2026-09-20', calls: 10, success_rate: 1, p95_latency_ms: null, cost_usd: 0 },
    { bucket: '2026-09-21', calls: 20, success_rate: 1, p95_latency_ms: null, cost_usd: 0 },
    { bucket: '2026-09-22', calls: 0, success_rate: 1, p95_latency_ms: null, cost_usd: 0 },
    { bucket: '2026-09-23', calls: 5, success_rate: 1, p95_latency_ms: null, cost_usd: 0 },
  ],
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="zh" messages={{ opsLlm: messages.opsLlm }}>
      <ActivityHeatmap opsKey="k" />
    </NextIntlClientProvider>,
  );
}

describe('ActivityHeatmap (E4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders stats from daily buckets', async () => {
    apiGet.mockResolvedValue({ success: true, data: SERIES });
    renderCard();
    await waitFor(() => expect(screen.getByTestId('activity-heatmap')).toBeInTheDocument());
    expect(await screen.findByText('35')).toBeInTheDocument();      // total
    expect(screen.getByText('2')).toBeInTheDocument();              // longest streak (20,21 then break then 5)
    // requests the 90d window independent of the page selector
    expect(apiGet).toHaveBeenCalledWith('/api/v1/stats/llm', { hours: 2160 }, expect.anything());
  });

  it('shows empty state when no series', async () => {
    apiGet.mockResolvedValue({ success: true, data: { series: [] } });
    renderCard();
    await screen.findByTestId('activity-heatmap');
    expect(screen.getByText(messages.opsLlm.empty)).toBeInTheDocument();
  });
});
