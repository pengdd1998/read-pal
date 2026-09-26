'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/client';
import { formatTraceTime } from '@/lib/ops-format';

/**
 * Synthetic session browser (H5b, P-H): chains threaded by
 * (user, book, 30-min gap) — the read-pal counterpart of CCR's session
 * list. Row expand shows the chain chips; each chip deep-links the
 * traces page with request_prefix prefilled (F1 linkage).
 */

interface SessionRow {
  user: string | null;
  book_id: string | null;
  started_at: string;
  last_active_at: string;
  chains: number;
  calls: number;
  tool_calls: number;
  errors: number;
  fallbacks: number;
  cache_ratio: number;
  tokens: number;
  cost_usd: number;
  models: string[];
  providers: string[];
  chain_list: Array<{ http_request_id: string; start: string; calls: number }>;
}

export const SessionsBrowser = React.memo(function SessionsBrowser({ opsKey }: { opsKey: string }) {
  const t = useTranslations('opsLlm');
  const router = useRouter();
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (h: number) => {
    setLoading(true);
    try {
      const res = await api.get<{ sessions: SessionRow[]; total: number }>(
        '/api/v1/stats/llm/sessions',
        { hours: h },
        { headers: { 'X-Ops-Key': opsKey } },
      );
      if (res.success && res.data) {
        setRows(res.data.sessions ?? []);
        setTotal(res.data.total ?? 0);
      }
    } catch { /* keep last rows */ } finally {
      setLoading(false);
    }
  }, [opsKey]);

  useEffect(() => { load(hours); }, [hours, load]);

  const dur = (s: SessionRow) => {
    const ms = new Date(s.last_active_at).getTime() - new Date(s.started_at).getTime();
    return ms <= 0 ? '—' : `${(ms / 60000).toFixed(0)}m`;
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 items-center mb-4">
        {[24, 168].map((h) => (
          <button key={h} type="button" onClick={() => setHours(h)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${hours === h ? 'bg-amber-600 text-white' : 'bg-surface-1 text-gray-600 dark:text-gray-300'}`}>
            {h === 24 ? t('w_24h') : t('w_7d')}
          </button>
        ))}
        <button type="button" onClick={() => load(hours)}
          className="px-3 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-sm">↻</button>
        <span className="text-xs text-gray-400 ml-auto">{t('sessions_total', { count: total })}</span>
      </div>

      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-4 py-3">{t('sessions_started')}</th>
              <th className="px-4 py-3">{t('sessions_user')}</th>
              <th className="px-4 py-3">{t('sessions_duration')}</th>
              <th className="px-4 py-3">{t('sessions_chains')}</th>
              <th className="px-4 py-3">{t('t_calls')}</th>
              <th className="px-4 py-3">{t('sessions_tools')}</th>
              <th className="px-4 py-3">{t('sessions_errors')}</th>
              <th className="px-4 py-3">{t('t_tokens')}</th>
              <th className="px-4 py-3">{t('t_cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const ts = formatTraceTime(s.started_at);
              return (
              <React.Fragment key={`${s.user}-${s.started_at}-${i}`}>
                <tr
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpanded(expanded === i ? null : i);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={expanded === i}
                  className={`border-b border-surface-3/50 cursor-pointer hover:bg-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${expanded === i ? 'bg-amber-50/40' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" title={ts.full}>
                    {ts.main} <span className="text-gray-400">{ts.rel}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.user ?? '—'}</td>
                  <td className="px-4 py-3">{dur(s)}</td>
                  <td className="px-4 py-3">{s.chains}</td>
                  <td className="px-4 py-3">{s.calls}</td>
                  <td className="px-4 py-3">{s.tool_calls}</td>
                  <td className="px-4 py-3">
                    <span className={s.errors > 0 ? 'text-red-600' : 'text-gray-400'}>
                      {s.errors}{s.fallbacks > 0 ? ` (+${s.fallbacks}fb)` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{(s.tokens / 1000).toFixed(1)}k</td>
                  <td className="px-4 py-3 tabular-nums">${s.cost_usd.toFixed(4)}</td>
                </tr>
                {expanded === i && (
                  <tr className="bg-surface-1/50">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
                        {t('sessions_chains')} · {s.models.join(', ') || '—'} · {s.providers.join(', ') || '—'} · cache {(s.cache_ratio * 100).toFixed(0)}%
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.chain_list.map((c) => (
                          <button key={c.http_request_id} type="button"
                            onClick={() => router.push(`/ops/llm/traces?request_prefix=${encodeURIComponent(c.http_request_id)}`)}
                            className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-xs font-mono text-amber-700 dark:text-amber-300 hover:border-amber-400">
                            {c.http_request_id} · {c.calls}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400" data-testid="sessions-empty">{t('empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-center text-xs text-gray-400 mt-3">{t('loading')}</div>}
    </div>
  );
});
