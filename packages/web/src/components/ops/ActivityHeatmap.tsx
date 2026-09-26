'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api/client';
import type { SeriesPoint } from '@/components/ops/SeriesChart';

/**
 * Activity heatmap (E4, completed 09-26): GitHub-style ~13-week grid over
 * the 90d rollup window. Self-fetches hours=2160 (daily buckets) so the
 * card is independent of the overview window selector — the main window
 * caps at 30d for the KPI cards, the heatmap wants the full retention.
 * Zero-dependency markup like every other ops chart.
 */

interface HeatCell {
  date: string; // YYYY-MM-DD
  calls: number;
}

const WEEKS = 13;

function intensity(calls: number, max: number): string {
  if (calls <= 0) return 'bg-surface-2';
  const r = calls / max;
  if (r > 0.75) return 'bg-amber-600';
  if (r > 0.5) return 'bg-amber-500';
  if (r > 0.25) return 'bg-amber-400';
  return 'bg-amber-200';
}

export const ActivityHeatmap = React.memo(function ActivityHeatmap({ opsKey }: { opsKey: string }) {
  const t = useTranslations('opsLlm');
  const [cells, setCells] = useState<HeatCell[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ series: SeriesPoint[] }>(
        '/api/v1/stats/llm',
        { hours: 2160 },
        { headers: { 'X-Ops-Key': opsKey } },
      );
      if (res.success && res.data) {
        // >48h windows return daily buckets — keys are YYYY-MM-DD.
        setCells((res.data.series ?? []).map((p) => ({ date: p.bucket.slice(0, 10), calls: p.calls })));
      }
    } catch { /* keep last */ } finally {
      setLoaded(true);
    }
  }, [opsKey]);

  useEffect(() => { load(); }, [load]);

  const max = Math.max(...cells.map((c) => c.calls), 1);
  const activeDays = cells.filter((c) => c.calls > 0).length;
  const total = cells.reduce((a, c) => a + c.calls, 0);
  // Longest consecutive active-day streak. Cells cover contiguous calendar
  // days (daily buckets, zero-call days included), so consecutive entries
  // are consecutive dates.
  let best = 0, run = 0;
  for (const c of [...cells].sort((a, b) => a.date.localeCompare(b.date))) {
    run = c.calls > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  const byDate = new Map(cells.map((c) => [c.date, c]));

  // Grid: columns = weeks ending today, rows = weekday (Mon..Sun).
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // align Monday
  const weeks: Array<Array<HeatCell | null>> = [];
  for (let w = 0; w <= WEEKS; w++) {
    const col: Array<HeatCell | null> = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      col.push(day > end ? null : (byDate.get(day.toISOString().slice(0, 10)) ?? { date: day.toISOString().slice(0, 10), calls: 0 }));
    }
    weeks.push(col);
  }

  return (
    <div className="bg-surface-0 rounded-2xl border border-surface-3 p-5" data-testid="activity-heatmap">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('heatmap_title')}</h2>
        <div className="text-xs text-gray-400 flex gap-3">
          <span>{t('heatmap_streak')}: <strong className="text-gray-700 dark:text-gray-200">{best}</strong></span>
          <span>{t('heatmap_daily_avg')}: <strong className="text-gray-700 dark:text-gray-200">{(total / Math.max(activeDays, 1)).toFixed(0)}</strong></span>
          <span>{t('heatmap_total')}: <strong className="text-gray-700 dark:text-gray-200">{total}</strong></span>
        </div>
      </div>
      {loaded && cells.length === 0 ? (
        <div className="text-xs text-gray-400 py-4">{t('empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-[3px] w-max" role="img" aria-label={t('heatmap_title')}>
            {weeks.map((col, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {col.map((c, di) => (
                  <div key={di}
                    className={`w-[11px] h-[11px] rounded-[2px] ${c ? intensity(c.calls, max) : 'bg-transparent'}`}
                    title={c ? `${c.date}: ${c.calls}` : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
