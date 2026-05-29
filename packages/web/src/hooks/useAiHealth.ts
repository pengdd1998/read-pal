'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

export function useAiHealth(): boolean | null {
  const [aiHealthy, setAiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/agents/health`);
        if (!cancelled && res.ok) {
          const data = await res.json() as { healthy?: boolean };
          setAiHealthy(data.healthy === true);
        }
      } catch {
        if (!cancelled) setAiHealthy(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return aiHealthy;
}
