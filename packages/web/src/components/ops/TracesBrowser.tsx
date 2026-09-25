'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api/client';
import { authFetch } from '@/lib/auth-fetch';

/**
 * Row-level trace browser (P-B): filterable /requests list with drill into
 * one http_request_id's full span chain (one SSE turn: main answer + tool
 * loop + fallback retries). The copy button feeds the badcase-triage
 * runbook's replay flow — request_id is the join key for chat_messages /
 * llm_call_traces reconstruction.
 */

interface TraceSpan {
  id: string;
  request_id: string;
  http_request_id: string | null;
  ts: string;
  label: string;
  model: string;
  provider: string | null;
  latency_ms: number;
  ttft_ms: number | null;
  success: boolean;
  error_type: string | null;
  error_message: string | null;
  fallback_used: boolean;
  cache_hit: boolean;
  prompt_version: string | null;
  tokens: { input: number; output: number; total: number };
  estimated_cost_usd: number;
  user: string | null;
  http_status?: number | null;
  streaming?: boolean | null;
  cache_read_tokens?: number | null;
  finish_reason?: string | null;
}

interface ListData {
  total: number;
  limit: number;
  offset: number;
  items: TraceSpan[];
  content_search_unavailable?: boolean;
}

interface ChainData {
  http_request_id: string;
  span_count: number;
  chain_latency_ms: number;
  labels: string[];
  providers: string[];
  has_fallback: boolean;
  all_success: boolean;
  spans: TraceSpan[];
}

interface ContentData {
  request_id: string;
  label: string;
  model: string;
  prompt_version: string | null;
  prompt_text: string | null;
  output_text: string | null;
  prompt_truncated: boolean;
  output_truncated: boolean;
  created_at: string | null;
}

// P-D: per-span lazy content state. Empty states derive from span metadata
// first (cache_hit / success are already in the chain payload); only the
// "not captured or past retention" case comes from the API's not_found.
type ContentState =
  | { status: 'loading' }
  | { status: 'ok'; data: ContentData }
  | { status: 'empty'; reason: 'cache' | 'failed' | 'expired' }
  | { status: 'disabled' };

const PAGE_SIZE = 25;

export const TracesBrowser = React.memo(function TracesBrowser({ opsKey, copyImpl }: { opsKey: string; copyImpl?: (text: string) => Promise<void> }) {
  const t = useTranslations('opsLlm');
  const searchParams = useSearchParams() as ReturnType<typeof useSearchParams> | null;
  const [hours, setHours] = useState(24);
  // F1: URL pre-fill from by_label/error-chip drill-through
  const [labelFilter, setLabelFilter] = useState(() => searchParams?.get('label') || '');
  const [onlyFailed, setOnlyFailed] = useState(() => Boolean(searchParams?.get('error_type')));
  const [requestPrefix, setRequestPrefix] = useState('');
  const [contentQuery, setContentQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [chain, setChain] = useState<ChainData | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setChain(null);
    try {
      const params: Record<string, string | number | boolean> = { hours, limit: pageSize, offset: page * pageSize };
      if (labelFilter.trim()) params.label = labelFilter.trim();
      const errorType = searchParams?.get('error_type');
      if (onlyFailed) {
        params.success = false;
        if (errorType) params.error_type = errorType;
      }
      if (requestPrefix.trim()) params.request_prefix = requestPrefix.trim();
      if (contentQuery.trim()) params.q = contentQuery.trim();
      const res = await api.get<ListData>('/api/v1/stats/llm/requests', params, {
        headers: { 'X-Ops-Key': opsKey },
      });
      if (res.success && res.data) setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hours, labelFilter, onlyFailed, requestPrefix, contentQuery, page, opsKey, searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  // F4: auto-refresh for live troubleshooting
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const openChain = useCallback(async (httpRequestId: string) => {
    if (!httpRequestId) return;
    setChainLoading(true);
    try {
      const res = await api.get<ChainData>(
        `/api/v1/stats/llm/requests/${httpRequestId}`,
        {},
        { headers: { 'X-Ops-Key': opsKey } },
      );
      setChain(res.success && res.data ? res.data : null);
    } catch {
      setChain(null);
    } finally {
      setChainLoading(false);
    }
  }, [opsKey]);

  const copy = async (text: string) => {
    try {
      // Test seam: jsdom's realm-exposed navigator ignores vi.stubGlobal,
      // so the clipboard call is injectable instead of monkey-patched.
      await (copyImpl ?? navigator.clipboard.writeText.bind(navigator.clipboard))(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable — the raw id is still selectable */
    }
  };

  const [spanContent, setSpanContent] = useState<Record<string, ContentState>>({});

  const toggleContent = useCallback(async (span: TraceSpan) => {
    const wasOpen = Boolean(spanContent[span.id]);
    setSpanContent((prev) => {
      if (prev[span.id]) {
        const { [span.id]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [span.id]: { status: 'loading' } };
    });
    if (wasOpen) return; // toggling off — no fetch
    let next: ContentState;
    if (span.cache_hit) {
      next = { status: 'empty', reason: 'cache' };
    } else if (!span.success) {
      next = { status: 'empty', reason: 'failed' };
    } else {
      // Raw fetch (not the api client): the 404 reason lives in FastAPI's
      // `detail` envelope, which the client's error mapping flattens away.
      try {
        // 0034: fallback chains share the request_id across attempts —
        // the span's model disambiguates which attempt's I/O to fetch.
        const modelQ = span.model ? `?model=${encodeURIComponent(span.model)}` : '';
        const res = await authFetch(
          `/api/v1/stats/llm/requests/${span.request_id}/content${modelQ}`,
          { headers: { 'X-Ops-Key': opsKey } },
        );
        if (res.ok) {
          const body = await res.json();
          next = body?.data ? { status: 'ok', data: body.data as ContentData } : { status: 'empty', reason: 'expired' };
        } else {
          let reason = 'not_found';
          try { reason = (await res.json())?.detail?.reason ?? 'not_found'; } catch { /* body unparsable → not_found */ }
          next = reason === 'capture_disabled'
            ? { status: 'disabled' }
            : { status: 'empty', reason: 'expired' };
        }
      } catch {
        next = { status: 'empty', reason: 'expired' };
      }
    }
    setSpanContent((prev) => ({ ...prev, [span.id]: next }));
  }, [opsKey, spanContent]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={hours}
          onChange={(e) => { setHours(Number(e.target.value)); setPage(0); }}
          className="px-3 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm"
          aria-label={t('window')}
        >
          <option value={1}>1h</option>
          <option value={24}>24h</option>
          <option value={168}>7d</option>
        </select>
        <input
          value={labelFilter}
          onChange={(e) => { setLabelFilter(e.target.value); setPage(0); }}
          placeholder={t('f_label')}
          className="px-3 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm w-44"
        />
        <input
          value={requestPrefix}
          onChange={(e) => { setRequestPrefix(e.target.value); setPage(0); }}
          placeholder={t('f_request')}
          className="px-3 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm w-44 font-mono"
        />
        <input
          value={contentQuery}
          onChange={(e) => { setContentQuery(e.target.value); setPage(0); }}
          placeholder={t('f_content_search')}
          data-testid="content-search"
          className="px-3 py-1.5 rounded-lg border border-surface-3 bg-surface-1 text-sm w-56"
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={onlyFailed} onChange={(e) => { setOnlyFailed(e.target.checked); setPage(0); }} />
          {t('f_failed')}
        </label>
        <button type="button" onClick={load} className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-sm">
          {t('f_apply')}
        </button>
        <button type="button" onClick={load} className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-sm">
          ↻
        </button>
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          {t('auto_refresh')}
        </label>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          className="px-2 py-1 rounded border border-surface-3 bg-surface-1 text-xs" aria-label={t('page_size')}>
          {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {data?.content_search_unavailable && (
          <span className="text-xs text-amber-600" data-testid="content-search-off">{t('content_search_off')}</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{t('total_rows', { count: total })}</span>
      </div>

      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-3 py-2.5">{t('t_time')}</th>
              <th className="px-3 py-2.5">{t('label')}</th>
              <th className="px-3 py-2.5">model</th>
              <th className="px-3 py-2.5">{t('t_latency')}</th>
              <th className="px-3 py-2.5">{t('t_status')}</th>
              <th className="px-3 py-2.5">{t('t_http')}</th>
              <th className="px-3 py-2.5">request_id</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((row) => (
              <tr
                key={row.id}
                onClick={() => openChain(row.http_request_id || '')}
                className="border-b border-surface-3/50 last:border-0 cursor-pointer hover:bg-surface-1"
              >
                <td className="px-3 py-2.5 font-mono text-xs">{row.ts.slice(5, 19)}</td>
                <td className="px-3 py-2.5">{row.label}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{row.provider}/{row.model}</td>
                <td className="px-3 py-2.5 tabular-nums">{(row.latency_ms / 1000).toFixed(1)}s</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    row.success
                      ? row.fallback_used
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/40'
                      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40'
                  }`}>
                    {row.success ? (row.fallback_used ? t('status_okfb') : t('status_ok')) : (row.error_type || t('status_error'))}
                  </span>
                  {row.streaming && <span className="ml-1 text-[9px] text-violet-500" title={t('t_streaming')}>⚡</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{row.http_status ?? '—'}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{row.http_request_id || '—'}</td>
              </tr>
            ))}
            {(!data || data.items.length === 0) && !loading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">{t('empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 disabled:opacity-40">
            ←
          </button>
          <span className="text-xs text-gray-500">{page + 1} / {pages}</span>
          <button type="button" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 disabled:opacity-40">
            →
          </button>
        </div>
      )}

      {(chainLoading || chain) && (
        <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5" data-testid="chain-panel">
          {chainLoading || !chain ? (
            <div className="text-xs text-gray-400">{t('loading')}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold font-mono">{chain.http_request_id}</h3>
                <button
                  type="button"
                  onClick={() => copy(chain.http_request_id)}
                  className="px-2.5 py-1 rounded-lg bg-surface-1 border border-surface-3 text-xs"
                >
                  {copied === chain.http_request_id ? t('copied') : t('copy_id')}
                </button>
                <span className="text-xs text-gray-500">
                  {t('chain_summary', {
                    spans: chain.span_count,
                    latency: (chain.chain_latency_ms / 1000).toFixed(1),
                  })}
                  {chain.has_fallback ? ` · ${t('chain_fallback')}` : ''}
                </span>
              </div>
              {/* F2: waterfall timeline — span bars offset from chain start */}
              {chain.spans.length > 1 && (() => {
                const starts = chain.spans.map((sp) => new Date(sp.ts).getTime());
                const chainStart = Math.min(...starts);
                const chainEnd = Math.max(...chain.spans.map((sp, i) => starts[i] + sp.latency_ms));
                const totalMs = Math.max(chainEnd - chainStart, 1);
                return (
                  <div className="mb-3 rounded-lg border border-surface-3 p-3" data-testid="waterfall">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">{t('waterfall')}</div>
                    {chain.spans.map((sp, i) => {
                      const offset = ((starts[i] - chainStart) / totalMs) * 100;
                      const width = (sp.latency_ms / totalMs) * 100;
                      return (
                        <div key={sp.id} className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-gray-500 w-16 truncate">{sp.label}</span>
                          <div className="flex-1 h-4 bg-surface-1 rounded relative overflow-hidden">
                            <div
                              className={`absolute h-full rounded ${sp.success ? 'bg-green-400/70' : 'bg-red-400/70'}`}
                              style={{ left: `${offset}%`, width: `${Math.max(width, 1)}%` }}
                            />
                            {sp.ttft_ms != null && (
                              <div
                                className="absolute top-0 bottom-0 w-px bg-amber-500"
                                style={{ left: `${offset + (sp.ttft_ms / totalMs) * 100}%` }}
                                title={`TTFT ${(sp.ttft_ms / 1000).toFixed(1)}s`}
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-gray-400 tabular-nums w-12">{(sp.latency_ms / 1000).toFixed(1)}s</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <ol className="space-y-1.5">
                {chain.spans.map((s) => {
                  const cs = spanContent[s.id];
                  return (
                    <li key={s.id} className="rounded-xl bg-surface-1 px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
                        <span className="font-mono text-gray-400">{s.ts.slice(11, 19)}</span>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-gray-500">{s.provider}/{s.model}</span>
                        <span className="tabular-nums">{(s.latency_ms / 1000).toFixed(1)}s{s.ttft_ms != null ? ` (ttft ${(s.ttft_ms / 1000).toFixed(1)}s)` : ''}</span>
                        <span className={s.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {s.success ? 'OK' : s.error_type || 'error'}
                        </span>
                        {s.fallback_used && <span className="text-amber-600">fallback</span>}
                        {s.cache_hit && <span className="text-gray-400">cache</span>}
                        <button
                          type="button"
                          onClick={() => toggleContent(s)}
                          data-testid={`content-toggle-${s.id}`}
                          className="px-2 py-0.5 rounded border border-surface-3 text-gray-600 dark:text-gray-300 hover:border-primary-400"
                        >
                          {cs ? '× ' : ''}{t('content_view')}
                        </button>
                        <span className="text-gray-400 ml-auto font-mono">{s.user ?? '—'}</span>
                      </div>
                      {cs && (
                        <div className="mt-2 space-y-2" data-testid={`content-panel-${s.id}`}>
                          {cs.status === 'loading' && <div className="text-gray-400">{t('loading')}</div>}
                          {cs.status === 'disabled' && (
                            <div className="text-amber-700 dark:text-amber-300">{t('content_disabled_banner')}</div>
                          )}
                          {cs.status === 'empty' && (
                            <div className="text-gray-400">
                              {cs.reason === 'cache' ? t('content_empty_cache')
                                : cs.reason === 'failed' ? t('content_empty_failed')
                                : t('content_empty_expired')}
                            </div>
                          )}
                          {cs.status === 'ok' && (
                            <>
                              {(['prompt', 'output'] as const).map((side) => {
                                const text = side === 'prompt' ? cs.data.prompt_text : cs.data.output_text;
                                const trunc = side === 'prompt' ? cs.data.prompt_truncated : cs.data.output_truncated;
                                return (
                                  <div key={side} className="rounded-lg border border-surface-3 overflow-hidden">
                                    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-0 border-b border-surface-3">
                                      <span className="font-medium">{side === 'prompt' ? t('content_prompt') : t('content_output')}</span>
                                      {trunc && (
                                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px]">
                                          {t('content_truncated')}
                                        </span>
                                      )}
                                      {text && (
                                        <button
                                          type="button"
                                          onClick={() => copy(text)}
                                          className="ml-auto px-2 py-0.5 rounded border border-surface-3 text-gray-600 dark:text-gray-300"
                                        >
                                          {copied === text ? t('copied') : t('content_copy')}
                                        </button>
                                      )}
                                    </div>
                                    <pre className="px-3 py-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
                                      {text || '—'}
                                    </pre>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
      {loading && <div className="text-center text-xs text-gray-400">{t('loading')}</div>}
    </div>
  );
});
