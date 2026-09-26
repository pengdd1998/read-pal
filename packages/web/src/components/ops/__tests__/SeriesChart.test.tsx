/**
 * H1 (P-H): x-axis label sampling — with >12 buckets, labels render every
 * ceil(n/12) buckets (first + last always labeled) instead of either
 * per-bucket overlap or the old <=24 all-or-nothing gate.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SeriesChart, type SeriesPoint } from '../SeriesChart';

const pt = (i: number): SeriesPoint => ({
  bucket: `2026-09-${String(i + 1).padStart(2, '0')}`,
  calls: i + 1,
  success_rate: 1,
  p95_latency_ms: 100 + i,
  cost_usd: 0.001,
});

describe('SeriesChart x-axis sampling (H1)', () => {
  it('renders a label per bucket when few points', () => {
    const { container } = render(<SeriesChart points={[pt(0), pt(1), pt(2)]} metric="calls" formatValue={(v) => `${v}`} />);
    expect(container.querySelectorAll('text')).toHaveLength(3);
  });

  it('samples labels down to ~12 for a 30-bucket month', () => {
    const points = Array.from({ length: 30 }, (_, i) => pt(i));
    const { container } = render(<SeriesChart points={points} metric="calls" formatValue={(v) => `${v}`} />);
    const labels = container.querySelectorAll('text');
    // step = ceil(30/12) = 3 → i%3==0 gives 10 + always-labeled last (i=29)
    expect(labels.length).toBeLessThanOrEqual(12);
    expect(labels.length).toBeGreaterThanOrEqual(10);
    // last bucket is always labeled (10-char ISO dates stay unsliced)
    const texts = [...labels].map((l) => l.textContent);
    expect(texts).toContain('2026-09-30');
  });
});
