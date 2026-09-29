'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { readOpsKey } from '@/lib/ops-key';
import { ProvidersManager } from '@/components/ops/ProvidersManager';

/** Provider management page (J3) — same unlock convention as the other console pages. */
export default function OpsProvidersPage() {
  const t = useTranslations('opsLlm');
  const [opsKey, setOpsKey] = useState<string | null>(null);

  useEffect(() => {
    setOpsKey(readOpsKey());
    const onKey = () => setOpsKey(readOpsKey());
    window.addEventListener('ops-key-changed', onKey);
    return () => window.removeEventListener('ops-key-changed', onKey);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">🔌 {t('pm_title')}</h1>
      {opsKey ? (
        <ProvidersManager opsKey={opsKey} />
      ) : (
        <p className="text-sm text-gray-500">
          {t('traces_locked')} <Link href="/ops/llm" className="text-primary-600 hover:underline">{t('traces_go_main')}</Link>
        </p>
      )}
    </div>
  );
}
