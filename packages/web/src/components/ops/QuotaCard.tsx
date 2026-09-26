'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api/client';

/**
 * Platform usage / quota card (H5a, P-H). The Zhipu balance API premise
 * failed live verification (404 on every candidate path), so this runs on
 * owned data: today's platform calls/tokens/cost from llm_call_traces,
 * day-over-day delta, top consumers as 8-hex digests, and an optional
 * soft cost budget bar (llm_ops_daily_cost_budget_usd). Ops-only endpoint
 * — rendered only when the caller supplies the ops key.
 */

interface QuotaData {
  today: { calls: number; tokens: number; cost_usd: number };
  yesterday: { calls: number; tokens: number; cost_usd: number };
  top_users_today: Array<{ user: string; calls: number; tokens: number }>;
  cost_budget_usd: number;
  budget_used_ratio: number | null;
}

function delta(now: number, before: number): string {
  if (before === 0) return now > 0 ? 'NEW' : '—';
  const pct = ((now - before) / before) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

export const QuotaCard = React.memo(function QuotaCard({ opsKey }: { opsKey: string }) {
  const t = useTranslations('opsLlm');
  const [data, setData] = useState<QuotaData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<QuotaData>('/api/v1/stats/llm/quota', {}, { headers: { 'X-Ops-Key': opsKey } });
      if (res.success && res.data) {
        setData(res.data);
        setError(false);
      } else setError(true);
    } catch {
      setError(true);
    }
  }, [opsKey]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const row = (label: string, value: string, d: string) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="tabular-nums text-gray-800 dark:text-gray-200">
        {value} <span className={`ml-1 text-xs ${d.startsWith('+') ? 'text-amber-600' : d.startsWith('-') ? 'text-green-600' : 'text-gray-400'}`}>{d}</span>
      </span>
    </div>
  );

  return (
    <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5" data-testid="quota-card">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{t('quota_title')}</h2>
      {!data && !error && <div className="text-xs text-gray-400">{t('loading')}</div>}
      {error && <div className="text-xs text-gray-400">{t('quota_unavailable')}</div>}
      {data && (
        <div className="space-y-2">
          {row(t('quota_calls'), String(data.today.calls), delta(data.today.calls, data.yesterday.calls))}
          {row(t('quota_tokens'), `${(data.today.tokens / 1000).toFixed(1)}k`, delta(data.today.tokens, data.yesterday.tokens))}
          {row(t('quota_cost'), `$${data.today.cost_usd.toFixed(4)}`, delta(data.today.cost_usd, data.yesterday.cost_usd))}
          {data.cost_budget_usd > 0 && (
            <div className="pt-1">
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden" role="progressbar"
                aria-valuenow={Math.round((data.budget_used_ratio ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className={`h-full ${(data.budget_used_ratio ?? 0) >= 0.9 ? 'bg-red-500' : (data.budget_used_ratio ?? 0) >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min((data.budget_used_ratio ?? 0) * 100, 100)}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-1">
                {t('quota_budget')}: ${data.today.cost_usd.toFixed(2)} / ${data.cost_budget_usd.toFixed(2)}
              </div>
            </div>
          )}
          {data.top_users_today.length > 0 && (
            <div className="pt-2 border-t border-surface-3 mt-1">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">{t('quota_top_users')}</div>
              <div className="flex flex-wrap gap-1.5">
                {data.top_users_today.map((u) => (
                  <span key={u.user} className="px-2 py-0.5 rounded-full bg-surface-1 border border-surface-3 text-[11px] font-mono">
                    {u.user}: {u.calls} · {(u.tokens / 1000).toFixed(1)}k
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
