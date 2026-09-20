'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api/client';

/**
 * Provider runtime card (P-B): TPM window usage + circuit state per
 * provider, plus the in-process circuit transition history. Polls every
 * 30s — cheap authenticated reads, no ops key needed (the endpoint is
 * user-scoped; the values are already aggregate, no cross-user leak).
 */

interface ProviderState {
  name: string;
  circuitState: string;
  avgLatencyMs: number;
  rpmWindowUsed: number;
  maxRpm: number;
  tpmWindowUsed: number;
  maxTpm: number;
}

interface Transition {
  provider: string;
  from: string;
  to: string;
  ts: string;
}

const CIRCUIT_COLOR: Record<string, string> = {
  closed: 'text-green-600 dark:text-green-400',
  open: 'text-red-600 dark:text-red-400',
  half_open: 'text-amber-600 dark:text-amber-400',
};

export const ProvidersCard = React.memo(function ProvidersCard() {
  const t = useTranslations('opsLlm');
  const [providers, setProviders] = useState<ProviderState[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ providers: ProviderState[]; circuitTransitions: Transition[] }>(
        '/api/v1/llm-providers',
      );
      if (res.success && res.data) {
        setProviders(res.data.providers ?? []);
        setTransitions((res.data.circuitTransitions ?? []).slice(-8).reverse());
      }
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('providers')}</h2>
        <span className="text-[10px] text-gray-400">30s</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {providers.map((p) => {
          const tpmPct = p.maxTpm > 0 ? Math.min(100, Math.round((p.tpmWindowUsed / p.maxTpm) * 100)) : null;
          return (
            <div key={p.name} className="rounded-xl bg-surface-1 px-3 py-2.5" data-testid={`provider-${p.name}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <span className={`text-xs font-medium ${CIRCUIT_COLOR[p.circuitState] ?? ''}`}>
                  {p.circuitState}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                TPM {p.tpmWindowUsed.toLocaleString()}{p.maxTpm > 0 ? ` / ${p.maxTpm.toLocaleString()}` : ''}
                {' · '}RPM {p.rpmWindowUsed}{p.maxRpm > 0 ? ` / ${p.maxRpm}` : ''}
                {' · '}avg {Math.round(p.avgLatencyMs)}ms
              </div>
              {tpmPct != null && (
                <div className="h-1.5 rounded-full bg-surface-3 mt-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${tpmPct >= 80 ? 'bg-red-500' : tpmPct >= 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${tpmPct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {providers.length === 0 && <div className="text-xs text-gray-400">{t('loading')}</div>}
      </div>
      {transitions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-3">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{t('transitions')}</div>
          {transitions.map((tr, i) => (
            <div key={i} className="text-[11px] text-gray-500 font-mono">
              {tr.ts.slice(5, 19)} {tr.provider}: {tr.from} → {tr.to}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
