'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

interface MetricsData {
  window_hours: number;
  total_calls: number;
  fresh_calls: number;
  success_rate: number | null;
  latency_ms: { p50: number | null; p95: number | null; p99: number | null } | null;
  tokens: { prompt: number; completion: number; total: number } | null;
  estimated_cost_usd: number;
  error_breakdown: Record<string, number>;
  guardrail_hits_today: Record<string, number>;
  by_label: Array<{ label: string; calls: number; success_rate: number; p95_latency_ms: number | null; total_tokens: number }>;
}

const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
    <div className="text-2xl font-bold mt-1.5 text-gray-900 dark:text-gray-100">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

export default function OpsLlmPage() {
  const t = useTranslations('opsLlm');
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const k = url.searchParams.get('key') || '';
    if (k) {
      setKey(k);
      sessionStorage.setItem('ops-key', k);
    } else {
      const saved = sessionStorage.getItem('ops-key');
      if (saved) setKey(saved);
    }
  }, []);

  const load = useCallback(async (h: number, k: string) => {
    if (!k) return;
    setLoading(true);
    try {
      const res = await api.get<MetricsData>(`/api/v1/stats/llm?hours=${h}&ops_key=${encodeURIComponent(k)}`);
      if (res.success && res.data) {
        setData(res.data);
        setAuthed(true);
      } else {
        setAuthed(false);
      }
    } catch {
      setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) load(hours, key);
  }, [key, hours, load]);

  if (!key || (!authed && !loading && key)) {
    return (
      <div className="container-content px-4 py-16 max-w-md mx-auto text-center">
        <div className="text-4xl mb-4">🔐</div>
        <h1 className="text-xl font-bold mb-4">{t('locked_title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('locked_desc')}</p>
        <div className="flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('key_placeholder')}
            className="flex-1 px-4 py-2.5 rounded-xl border border-surface-3 bg-surface-1"
          />
          <button
            type="button"
            onClick={() => load(hours, key)}
            className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-medium"
          >
            {t('unlock')}
          </button>
        </div>
      </div>
    );
  }

  const lat = data?.latency_ms;
  return (
    <div className="container-content px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🛰️ {t('title')}</h1>
        <div className="flex gap-1.5">
          {[1, 24, 168].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${
                hours === h ? 'bg-amber-600 text-white' : 'bg-surface-1 text-gray-600 dark:text-gray-300'
              }`}
            >
              {h === 1 ? t('w_1h') : h === 24 ? t('w_24h') : t('w_7d')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Card label={t('calls')} value={String(data?.total_calls ?? '—')} sub={`${data?.fresh_calls ?? 0} fresh`} />
        <Card
          label={t('success_rate')}
          value={data?.success_rate != null ? `${(data.success_rate * 100).toFixed(1)}%` : '—'}
        />
        <Card label={t('p95')} value={lat?.p95 != null ? `${(lat.p95 / 1000).toFixed(1)}s` : '—'} sub={lat?.p99 != null ? `p99 ${(lat.p99 / 1000).toFixed(1)}s` : ''} />
        <Card label={t('tokens')} value={data?.tokens ? `${(data.tokens.total / 1000).toFixed(1)}k` : '—'} sub={data ? `$${data.estimated_cost_usd.toFixed(4)}` : ''} />
        <Card
          label={t('guardrails')}
          value={String(data?.guardrail_hits_today?.total ?? 0)}
          sub={Object.entries(data?.error_breakdown ?? {}).slice(0, 2).map(([k2, v]) => `${k2}:${v}`).join(' ') || undefined}
        />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{t('by_label')}</h2>
      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-4 py-3">{t('label')}</th>
              <th className="px-4 py-3">{t('t_calls')}</th>
              <th className="px-4 py-3">{t('t_success')}</th>
              <th className="px-4 py-3">p95</th>
              <th className="px-4 py-3">{t('t_tokens')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.by_label ?? []).map((row) => (
              <tr key={row.label} className="border-b border-surface-3/50 last:border-0">
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3">{row.calls}</td>
                <td className="px-4 py-3">
                  <span className={row.success_rate >= 0.9 ? 'text-green-600' : row.success_rate >= 0.7 ? 'text-amber-600' : 'text-red-600'}>
                    {(row.success_rate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3">{row.p95_latency_ms != null ? `${(row.p95_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td className="px-4 py-3">{row.total_tokens.toLocaleString()}</td>
              </tr>
            ))}
            {(!data?.by_label || data.by_label.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-center text-xs text-gray-400 mt-4">{t('loading')}</div>}
    </div>
  );
}
