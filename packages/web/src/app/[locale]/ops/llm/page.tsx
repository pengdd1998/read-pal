'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ProvidersCard } from '@/components/ops/ProvidersCard';
import { SeriesChart, type SeriesPoint } from '@/components/ops/SeriesChart';

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
  by_label: Array<{
    label: string; calls: number; success_rate: number; p95_latency_ms: number | null;
    total_tokens: number; cost_usd: number; p95_ttft_ms: number | null; prompt_version: string | null;
  }>;
  series: SeriesPoint[];
  by_provider: Record<string, { calls: number; success_rate: number; p95_latency_ms: number | null }>;
  by_model: Record<string, { calls: number; success_rate: number; p95_latency_ms: number | null }>;
  fallback: { used: number; total: number };
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
  const router = useRouter();
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [hours, setHours] = useState(720);
  const [fLabel, setFLabel] = useState('');
  const [fProvider, setFProvider] = useState('');
  const [fModel, setFModel] = useState('');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Key lives in sessionStorage only — a ?key= URL would persist the
    // secret in browser history and nginx access logs (page navigation).
    const saved = sessionStorage.getItem('ops-key');
    if (saved) setKey(saved);
  }, [, fLabel, fProvider, fModel]);

  const load = useCallback(async (h: number, k: string) => {
    if (!k) return;
    setLoading(true);
    try {
      // Header, not query param: nginx access logs record the full request
      // line, so a query key would be persisted server-side on every call.
      const res = await api.get<MetricsData>(
        '/api/v1/stats/llm',
        { hours: h, ...(fLabel && { label: fLabel }), ...(fProvider && { provider: fProvider }), ...(fModel && { model: fModel }) },
        { headers: { 'X-Ops-Key': k } },
      );
      if (res.success && res.data) {
        setData(res.data);
        setAuthed(true);
        sessionStorage.setItem('ops-key', k);
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
  }, [key, hours, load, fLabel, fProvider, fModel]);

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
  const errors = Object.entries(data?.error_breakdown ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="container-content px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">🛰️ {t('title')}</h1>
        <div className="flex gap-1.5 items-center">
          <a href="/ops/llm/traces" className="px-3.5 py-1.5 rounded-lg text-sm font-medium bg-surface-1 text-gray-600 dark:text-gray-300 hover:border-primary-400 border border-transparent hover:border">
            🔍 {t('traces_link')}
          </a>
          <a href="/ops/llm/rag" className="px-3.5 py-1.5 rounded-lg text-sm font-medium bg-surface-1 text-gray-600 dark:text-gray-300 hover:border-primary-400 border border-transparent hover:border">
            📊 {t('rag_link')}
          </a>
          <select value={fLabel} onChange={(e) => setFLabel(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm" aria-label={t('filter_label')}>
            <option value="">{t('filter_label')}: {t('filter_all')}</option>
            {(data?.by_label ?? []).map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}
          </select>
          <select value={fProvider} onChange={(e) => setFProvider(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm" aria-label={t('filter_provider')}>
            <option value="">{t('filter_provider')}: {t('filter_all')}</option>
            {Object.keys(data?.by_provider ?? {}).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={fModel} onChange={(e) => setFModel(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm" aria-label={t('filter_model')}>
            <option value="">{t('filter_model')}: {t('filter_all')}</option>
            {Object.keys(data?.by_model ?? {}).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button type="button" onClick={() => load(hours, key)}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-sm">{t('refresh')}</button>
          <div className="flex gap-1.5">
            {[24, 168, 720].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${
                  hours === h ? 'bg-amber-600 text-white' : 'bg-surface-1 text-gray-600 dark:text-gray-300'
                }`}
              >
                {h === 24 ? t('w_24h') : h === 168 ? t('w_7d') : t('w_30d')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
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
          sub={data && data.fallback.total > 0 ? t('fallback_sub', data.fallback) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{t('series_calls')}</h2>
          <SeriesChart points={data?.series ?? []} metric="calls" formatValue={(v) => `${v}`} />
        </div>
        <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{t('series_p95')}</h2>
          <SeriesChart points={data?.series ?? []} metric="p95_latency_ms" formatValue={(v) => `${(v / 1000).toFixed(1)}s`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{t('errors_title')}</h2>
          {errors.length === 0 ? (
            <div className="text-xs text-gray-400">{t('errors_none')}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {errors.map(([name, count]) => (
                <span key={name} onClick={() => router.push(`/ops/llm/traces?error_type=${encodeURIComponent(name)}`)} className="px-2.5 py-1 rounded-full bg-red-50 cursor-pointer hover:border-red-400 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-xs text-red-700 dark:text-red-300">
                  {name} · {count}
                </span>
              ))}
            </div>
          )}
          {data && Object.keys(data.by_provider).length > 0 && (
            <div className="mt-4 pt-4 border-t border-surface-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">{t('by_provider')}</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.by_provider).map(([name, p]) => (
                  <span key={name} className="px-2.5 py-1 rounded-full bg-surface-1 border border-surface-3 text-xs">
                    {name}: {p.calls} · {(p.success_rate * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <ProvidersCard />
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
              <th className="px-4 py-3">{t('t_ttft')}</th>
              <th className="px-4 py-3">{t('t_tokens')}</th>
              <th className="px-4 py-3">{t('t_cost')}</th>
              <th className="px-4 py-3">ver</th>
            </tr>
          </thead>
          <tbody>
            {(data?.by_label ?? []).map((row) => (
              <tr key={row.label} onClick={() => router.push(`/ops/llm/traces?label=${encodeURIComponent(row.label)}`)} className="border-b border-surface-3/50 last:border-0 cursor-pointer hover:bg-surface-1">
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3">{row.calls}</td>
                <td className="px-4 py-3">
                  <span className={row.success_rate >= 0.9 ? 'text-green-600' : row.success_rate >= 0.7 ? 'text-amber-600' : 'text-red-600'}>
                    {(row.success_rate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-3">{row.p95_latency_ms != null ? `${(row.p95_latency_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td className="px-4 py-3">{row.p95_ttft_ms != null ? `${(row.p95_ttft_ms / 1000).toFixed(1)}s` : '—'}</td>
                <td className="px-4 py-3">{row.total_tokens.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums">${row.cost_usd.toFixed(4)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{row.prompt_version ?? '—'}</td>
              </tr>
            ))}
            {(!data?.by_label || data.by_label.length === 0) && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{t('empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-center text-xs text-gray-400 mt-4">{t('loading')}</div>}
    </div>
  );
}
