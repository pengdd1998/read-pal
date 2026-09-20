'use client';

import React from 'react';

/**
 * Sparse-series bar chart over metrics buckets (P-B, monitoring upgrade).
 *
 * Deliberately dependency-free SVG: the ops page must not pull a charting
 * library for two small charts. Bars encode call volume, color encodes the
 * success rate band (>=0.95 green, >=0.8 amber, else red) so one glance
 * covers "how much" and "how healthy". Sparse buckets render as-is — the
 * x-axis is categorical, not continuous.
 */

export interface SeriesPoint {
  bucket: string;
  calls: number;
  success_rate: number;
  p95_latency_ms: number | null;
  cost_usd: number;
}

const HEIGHT = 120;
const BAR_MAX = 28;
const GAP = 6;

function bandColor(successRate: number): string {
  if (successRate >= 0.95) return '#10b981';
  if (successRate >= 0.8) return '#f59e0b';
  return '#ef4444';
}

export const SeriesChart = React.memo(function SeriesChart({
  points,
  metric,
  formatValue,
}: {
  points: SeriesPoint[];
  metric: 'calls' | 'p95_latency_ms' | 'cost_usd';
  formatValue: (v: number) => string;
}) {
  const values = points.map((p) => (metric === 'p95_latency_ms' ? p.p95_latency_ms ?? 0 : p[metric]));
  const max = Math.max(...values, 1);
  const width = Math.max(points.length * (BAR_MAX + GAP), 200);

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={HEIGHT + 26}
        role="img"
        className="block"
        data-testid={`series-chart-${metric}`}
      >
        {points.map((p, i) => {
          const v = metric === 'p95_latency_ms' ? p.p95_latency_ms ?? 0 : p[metric];
          const h = Math.round((v / max) * (HEIGHT - 12)) || (v > 0 ? 2 : 0);
          const x = i * (BAR_MAX + GAP);
          return (
            <g key={p.bucket}>
              <rect
                x={x}
                y={HEIGHT - h}
                width={BAR_MAX}
                height={h}
                rx={3}
                fill={metric === 'calls' ? bandColor(p.success_rate) : '#6366f1'}
                opacity={0.85}
              >
                <title>{`${p.bucket}: ${formatValue(v)} (${(p.success_rate * 100).toFixed(0)}%)`}</title>
              </rect>
              {points.length <= 24 && (
                <text x={x + BAR_MAX / 2} y={HEIGHT + 16} textAnchor="middle" className="fill-gray-400" fontSize={9}>
                  {p.bucket.length > 10 ? p.bucket.slice(5) : p.bucket}
                </text>
              )}
            </g>
          );
        })}
        {points.length === 0 && (
          <text x={12} y={HEIGHT / 2} className="fill-gray-400" fontSize={12}>
            —
          </text>
        )}
      </svg>
    </div>
  );
});
