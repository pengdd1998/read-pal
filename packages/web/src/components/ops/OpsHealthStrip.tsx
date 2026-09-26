'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { readOpsKey, clearOpsKey } from '@/lib/ops-key';

/**
 * Standalone-console strip (J1/J2, P-J): the ops shell has no product
 * header, so this slim top bar carries the always-on signals instead —
 * backend health dot (public /health), provider circuit summary
 * (ops-key), and the lock button that clears the stored key. 30s poll;
 * requests are cheap reads.
 */

interface ProviderBrief {
  name: string;
  circuitState: string;
}

const CIRCUIT_DOT: Record<string, string> = {
  closed: 'bg-emerald-500',
  half_open: 'bg-amber-500',
  open: 'bg-red-500',
};

export const OpsHealthStrip = React.memo(function OpsHealthStrip() {
  const t = useTranslations('opsLlm');
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<ProviderBrief[]>([]);
  const [hasKey, setHasKey] = useState(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/health');
      setHealthy(r.ok);
    } catch {
      setHealthy(false);
    }
    const key = readOpsKey();
    setHasKey(!!key);
    if (!key) {
      setProviders([]);
      return;
    }
    try {
      const res = await fetch('/api/v1/llm-providers', { headers: { 'X-Ops-Key': key } });
      if (res.ok) {
        const body = await res.json();
        setProviders((body?.data?.providers ?? []).map((p: { name: string; circuitState: string }) => ({
          name: p.name, circuitState: p.circuitState,
        })));
      }
    } catch { /* strip is best-effort */ }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 30_000);
    // Unlock/lock in another component (or tab) reflects immediately
    // instead of waiting for the next 30s tick.
    const onKeyChange = () => poll();
    window.addEventListener('ops-key-changed', onKeyChange);
    window.addEventListener('storage', onKeyChange);
    return () => {
      clearInterval(id);
      window.removeEventListener('ops-key-changed', onKeyChange);
      window.removeEventListener('storage', onKeyChange);
    };
  }, [poll]);

  const lock = () => {
    clearOpsKey();
    window.location.reload();
  };

  return (
    <div className="sticky top-0 z-30 border-b border-surface-3 bg-surface-0/90 backdrop-blur" data-testid="ops-health-strip">
      <div className="container-content px-4 sm:px-6 h-10 flex items-center gap-4 text-xs">
        <span className="font-semibold text-gray-700 dark:text-gray-200">🛰️ read-pal ops</span>
        <span className="flex items-center gap-1.5" title={t('health_backend')}>
          <span className={`inline-block w-2 h-2 rounded-full ${healthy == null ? 'bg-gray-400' : healthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-gray-500">{healthy == null ? '…' : healthy ? t('health_ok') : t('health_down')}</span>
        </span>
        {providers.length > 0 && (
          <span className="hidden sm:flex items-center gap-3">
            {providers.map((p) => (
              <span key={p.name} className="flex items-center gap-1 text-gray-500" title={p.circuitState}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${CIRCUIT_DOT[p.circuitState] || 'bg-gray-400'}`} />
                {p.name}
              </span>
            ))}
          </span>
        )}
        {hasKey && (
          <button type="button" onClick={lock}
            className="ml-auto px-2 py-0.5 rounded-lg border border-surface-3 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            title={t('lock_hint')}>
            🔒 {t('lock')}
          </button>
        )}
      </div>
    </div>
  );
});
