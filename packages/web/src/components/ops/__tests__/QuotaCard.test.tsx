/**
 * H5a (P-H): platform quota card — renders today aggregates with
 * day-over-day deltas, budget bar only when a budget is configured,
 * top-consumer digest chips.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const apiGet = vi.fn();
vi.mock('@/lib/api/client', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

import messages from '../../../../messages/zh.json';
import { QuotaCard } from '../QuotaCard';

const DATA = {
  today: { calls: 12, tokens: 34000, cost_usd: 0.0123 },
  yesterday: { calls: 10, tokens: 30000, cost_usd: 0.0100 },
  top_users_today: [{ user: 'abcd1234', calls: 8, tokens: 20000 }],
  cost_budget_usd: 0.02,
  budget_used_ratio: 0.615,
};

function renderCard() {
  return render(
    <NextIntlClientProvider locale="zh" messages={messages.opsLlm}>
      <QuotaCard opsKey="k" />
    </NextIntlClientProvider>,
  );
}

describe('QuotaCard (H5a)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows today rows with deltas and the budget bar when configured', async () => {
    apiGet.mockResolvedValue({ success: true, data: DATA });
    renderCard();
    expect(await screen.findByTestId('quota-card')).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText(/\+20%/)).toBeInTheDocument();      // calls delta
    expect(screen.getByRole('progressbar')).toBeInTheDocument(); // budget bar (0.02 > 0)
    expect(screen.getByText(/abcd1234/)).toBeInTheDocument();   // digest chip
  });

  it('hides the budget bar when no budget is configured', async () => {
    apiGet.mockResolvedValue({ success: true, data: { ...DATA, cost_budget_usd: 0, budget_used_ratio: null } });
    renderCard();
    await screen.findByText('12');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
