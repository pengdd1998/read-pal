'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { authFetch } from '@/lib/auth-fetch';
import { readOpsKey } from '@/lib/ops-key';

/**
 * Provider management (J3, P-J — reopens the old "no provider UI" call
 * now that the console is standalone): edit priority / rate caps, reload
 * from env, apply an in-memory hot swap. The PUT body carries an empty
 * api_key for unchanged providers — the server merges live keys back and
 * rejects keyless new entries. In-memory only: a restart reverts to the
 * deployment env (that durability path stays compose/.env). Session-scope
 * action log = the audit trail.
 */

interface ProviderRow {
  name: string;
  baseUrl: string;
  models: Record<string, string>;
  priority: number;
  costWeight: number;
  maxRpm: number;
  maxTpm: number;
  circuitState: string;
  avgLatencyMs: number;
  rpmWindowUsed: number;
  tpmWindowUsed: number;
  isDefault?: boolean;
}

interface EditState {
  priority: string;
  maxRpm: string;
  maxTpm: string;
}

const CIRCUIT_COLOR: Record<string, string> = {
  closed: 'text-green-600 dark:text-green-400',
  half_open: 'text-amber-600 dark:text-amber-400',
  open: 'text-red-600 dark:text-red-400',
};

export const ProvidersManager = React.memo(function ProvidersManager({ opsKey }: { opsKey: string }) {
  const t = useTranslations('opsLlm');
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const note = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog((l) => [`${ts} — ${msg}`, ...l].slice(0, 12));
  };

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/llm-providers', { headers: { 'X-Ops-Key': opsKey } });
      if (res.ok) {
        const body = await res.json();
        const rows: ProviderRow[] = body?.data?.providers ?? [];
        setProviders(rows);
        setEdits(Object.fromEntries(rows.map((p) => [p.name, {
          priority: String(p.priority), maxRpm: String(p.maxRpm), maxTpm: String(p.maxTpm),
        }])));
      }
    } catch { /* best-effort */ }
  }, [opsKey]);

  useEffect(() => { load(); }, [load]);

  const reloadEnv = async () => {
    setBusy(true);
    try {
      const res = await authFetch('/api/v1/llm-providers/reload', {
        method: 'POST', headers: { 'X-Ops-Key': opsKey },
      });
      const body = await res.json();
      note(body?.data?.changed ? t('pm_reloaded_changed') : t('pm_reloaded_same'));
      await load();
    } catch { note(t('pm_failed')); } finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const payload = providers.map((p) => {
        const e = edits[p.name] ?? { priority: String(p.priority), maxRpm: String(p.maxRpm), maxTpm: String(p.maxTpm) };
        return {
          name: p.name,
          base_url: p.baseUrl,
          api_key: '', // sentinel — server merges the live key back
          models: p.models,
          priority: Number(e.priority) || p.priority,
          cost_weight: p.costWeight,
          max_rpm: Number(e.maxRpm) || 0,
          max_tpm: Number(e.maxTpm) || 0,
        };
      });
      const res = await authFetch('/api/v1/llm-providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Ops-Key': opsKey },
        body: JSON.stringify({ providers: payload }),
      });
      const body = await res.json();
      if (res.ok && body?.success) {
        note(t('pm_applied'));
        await load();
      } else {
        note(`${t('pm_failed')}: ${(body?.detail ?? body?.message ?? '').slice(0, 80)}`);
      }
    } catch { note(t('pm_failed')); } finally { setBusy(false); }
  };

  const edit = (name: string, field: keyof EditState, value: string) => {
    setEdits((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { priority: '1', maxRpm: '0', maxTpm: '0' }), [field]: value } }));
  };

  const dirty = providers.some((p) => {
    const e = edits[p.name];
    return e && (Number(e.priority) !== p.priority || Number(e.maxRpm) !== p.maxRpm || Number(e.maxTpm) !== p.maxTpm);
  });

  return (
    <div className="space-y-4" data-testid="providers-manager">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reloadEnv} disabled={busy}
          className="px-3.5 py-1.5 rounded-lg bg-surface-1 border border-surface-3 text-sm disabled:opacity-40">
          ↻ {t('pm_reload_env')}
        </button>
        <button type="button" onClick={apply} disabled={busy || !dirty}
          className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium disabled:opacity-40">
          {busy ? '…' : t('pm_apply')}
        </button>
        <span className="text-xs text-gray-400">{t('pm_in_memory_note')}</span>
      </div>

      <div className="bg-surface-0 rounded-2xl border border-surface-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-3 text-left text-xs text-gray-500">
              <th className="px-4 py-3">{t('pm_name')}</th>
              <th className="px-4 py-3">{t('pm_circuit')}</th>
              <th className="px-4 py-3">{t('pm_models')}</th>
              <th className="px-4 py-3">{t('pm_priority')}</th>
              <th className="px-4 py-3">max RPM</th>
              <th className="px-4 py-3">max TPM</th>
              <th className="px-4 py-3">{t('pm_live')}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.name} className="border-b border-surface-3/50 last:border-0">
                <td className="px-4 py-3 font-medium">{p.name}{p.isDefault && <span className="ml-1.5 text-[10px] text-gray-400">(env default)</span>}</td>
                <td className={`px-4 py-3 text-xs font-medium ${CIRCUIT_COLOR[p.circuitState] || 'text-gray-400'}`}>{p.circuitState}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-56 truncate" title={Object.values(p.models).join(', ')}>
                  {Object.values(p.models).join(', ')}
                </td>
                {(['priority', 'maxRpm', 'maxTpm'] as const).map((field) => (
                  <td key={field} className="px-4 py-3">
                    <input
                      type="number"
                      value={edits[p.name]?.[field] ?? ''}
                      onChange={(e) => edit(p.name, field, e.target.value)}
                      className="w-20 px-2 py-1 rounded-lg border border-surface-3 bg-surface-1 text-sm tabular-nums"
                      aria-label={`${p.name} ${field}`}
                    />
                  </td>
                ))}
                <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                  RPM {p.rpmWindowUsed} · TPM {p.tpmWindowUsed} · {p.avgLatencyMs}ms
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('loading')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="bg-surface-0 rounded-2xl border border-surface-3 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-2">{t('pm_audit_log')}</div>
          <ul className="space-y-1 font-mono text-xs text-gray-500">
            {log.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
});
