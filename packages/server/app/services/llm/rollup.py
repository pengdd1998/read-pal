"""LLM metrics rollup — write-side merge and read-side aggregation (P-C).

``upsert_traces`` folds a flush batch of trace dicts into the hourly
(hour, label, provider) rows — call-weighted p95 merge (trend-grade, see
the model docstring). ``rollup_metrics`` re-aggregates those rows into
the ``compute_llm_metrics`` response shape for long windows, replacing
the full trace scan beyond 48h. Retention prune shares the writer's
cadence (90d, derived data).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_metrics_rollup import ROLLUP_RETENTION_DAYS, LLMMetricsRollup

# Windows beyond this read the rollup instead of scanning traces
# (mirrors metrics.SERIES_HOURLY_MAX_HOURS — the same 48h boundary the
# series resolution switches at).
ROLLUP_READ_MIN_HOURS = 48


def _percentile(sorted_values: list[int], pct: float) -> int | None:
    if not sorted_values:
        return None
    idx = min(int(round(pct / 100 * (len(sorted_values) - 1))), len(sorted_values) - 1)
    return sorted_values[idx]


def _parse_errors(blob: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for part in blob.split(','):
        if '=' in part:
            name, _, n = part.partition('=')
            try:
                out[name] = int(n)
            except ValueError:
                continue
    return out


def _format_errors(counts: dict[str, int]) -> str:
    return ','.join(f'{k}={v}' for k, v in sorted(counts.items()))[:512]


def _hour_bucket(ts: datetime) -> datetime:
    """Floor a timestamp to its UTC hour, as naive UTC.

    Naive so the upsert's SELECT-then-merge matches identically on SQLite
    and Postgres (aware-datetime round-trips differ between them)."""
    if ts.tzinfo is not None:
        ts = ts.astimezone(UTC)
    return ts.replace(minute=0, second=0, microsecond=0, tzinfo=None)


async def upsert_traces(session: AsyncSession, traces: list[dict[str, Any]]) -> int:
    """Merge one flush batch of trace dicts into the rollup rows.

    Idempotent per hour-key: reads the existing rows for the touched
    hours, folds each batch group in, writes back. Batches are <=50 rows
    and hit few distinct keys, so the read-modify-write is cheap and
    never races (single writer task). Returns distinct rollup rows
    written (new + updated).
    """
    groups: dict[tuple[datetime, str, str], list[dict[str, Any]]] = {}
    for t in traces:
        ts = t.get('created_at') or datetime.now(UTC)
        key = (
            _hour_bucket(ts),
            str(t.get('label') or '(unset)')[:100],
            str(t.get('provider') or '(unset)')[:32],
        )
        groups.setdefault(key, []).append(t)

    existing = (
        await session.execute(
            select(LLMMetricsRollup).where(
                LLMMetricsRollup.hour.in_(sorted({k[0] for k in groups})),
            )
        )
    ).scalars().all()
    by_key = {(r.hour, r.label, r.provider): r for r in existing}

    for (hour, label, provider), batch in groups.items():
        row = by_key.get((hour, label, provider))
        if row is None:
            # Column defaults apply at INSERT flush, not construction —
            # zero-init explicitly so the merge arithmetic below can read
            # the attributes immediately.
            row = LLMMetricsRollup(
                hour=hour, label=label, provider=provider,
                calls=0, successes=0, fresh_calls=0, fallbacks=0,
                tokens_in=0, tokens_out=0, cost_usd=0.0,
                latency_cnt=0, latency_sum_ms=0, latency_max_ms=0,
                latency_p95_ms=0, error_counts='',
            )
            session.add(row)
            by_key[(hour, label, provider)] = row

        batch_latencies = sorted(
            t['latency_ms'] for t in batch
            if t.get('success') and not t.get('cache_hit')
        )
        batch_p95 = _percentile(batch_latencies, 95) or 0
        batch_n = len(batch_latencies)

        # Call-weighted p95 merge: an approximation by construction (true
        # percentile merging needs the samples); trend-grade is the goal —
        # exact numbers stay available via the row-level trace API.
        merged_n = row.latency_cnt + batch_n
        if merged_n > 0:
            row.latency_p95_ms = round(
                (row.latency_p95_ms * row.latency_cnt + batch_p95 * batch_n) / merged_n,
            )
        row.latency_cnt = merged_n
        row.latency_sum_ms += sum(batch_latencies)
        row.latency_max_ms = max(
            row.latency_max_ms, batch_latencies[-1] if batch_latencies else 0,
        )

        row.calls += len(batch)
        row.successes += sum(1 for t in batch if t.get('success'))
        row.fresh_calls += sum(1 for t in batch if not t.get('cache_hit'))
        row.fallbacks += sum(1 for t in batch if t.get('fallback_used'))
        row.tokens_in += sum(t.get('prompt_tokens') or 0 for t in batch)
        row.tokens_out += sum(t.get('completion_tokens') or 0 for t in batch)
        row.cost_usd += float(sum(t.get('estimated_cost_usd') or 0.0 for t in batch))

        merged_errors = _parse_errors(row.error_counts)
        for t in batch:
            if not t.get('success'):
                err = str(t.get('error_type') or 'unknown')[:32]
                merged_errors[err] = merged_errors.get(err, 0) + 1
        row.error_counts = _format_errors(merged_errors)

    await session.flush()
    return len(groups)


async def rollup_metrics(
    session: AsyncSession,
    *,
    hours: int,
    by_label_limit: int = 10,
) -> dict[str, Any]:
    """Aggregate rollup rows into the compute_llm_metrics response shape.

    Long-window (>48h) metrics come from here: bounded by 24×90 rows per
    key instead of the raw trace scan. ``by_model`` is empty by design —
    the rollup dimensions are hour × label × provider; model-level
    drilling stays on the trace path (<=48h windows).
    """
    since = datetime.now(UTC) - timedelta(hours=hours)
    rows = (
        await session.execute(
            select(LLMMetricsRollup).where(LLMMetricsRollup.hour >= _hour_bucket(since))
        )
    ).scalars().all()

    total = sum(r.calls for r in rows)
    successes = sum(r.successes for r in rows)
    fresh = sum(r.fresh_calls for r in rows)

    error_counts: dict[str, int] = {}
    for r in rows:
        for name, n in _parse_errors(r.error_counts).items():
            error_counts[name] = error_counts.get(name, 0) + n

    # Day-bucketed series (rollup windows are always >48h → daily).
    day_agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = r.hour.strftime('%Y-%m-%d')
        b = day_agg.setdefault(key, {'calls': 0, 'success': 0, 'cost': 0.0})
        b['calls'] += r.calls
        b['success'] += r.successes
        b['cost'] += r.cost_usd

    label_agg: dict[str, dict[str, Any]] = {}
    provider_agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        la = label_agg.setdefault(r.label, {'calls': 0, 'success': 0, 'p95': 0, 'cnt': 0, 'tokens': 0, 'cost': 0.0})
        la['calls'] += r.calls
        la['success'] += r.successes
        la['p95'] += r.latency_p95_ms * r.latency_cnt
        la['cnt'] += r.latency_cnt
        la['tokens'] += r.tokens_in + r.tokens_out
        la['cost'] += r.cost_usd

        pa = provider_agg.setdefault(r.provider, {'calls': 0, 'success': 0, 'p95': 0, 'cnt': 0})
        pa['calls'] += r.calls
        pa['success'] += r.successes
        pa['p95'] += r.latency_p95_ms * r.latency_cnt
        pa['cnt'] += r.latency_cnt

    def _p95_of(agg: dict[str, Any]) -> int | None:
        return round(agg['p95'] / agg['cnt']) if agg['cnt'] > 0 else None

    return {
        'window_hours': hours,
        'generated_at': datetime.now(UTC).isoformat(timespec='seconds'),
        'total_calls': total,
        'fresh_calls': fresh,
        'cache_hit_rate': round((total - fresh) / total, 4) if total else None,
        'success_rate': round(successes / total, 4) if total else None,
        'latency_ms': {
            'p50': None,  # sum/max only in rollup — p50/p99 stay trace-path
            'p95': _p95_of({'p95': sum(r.latency_p95_ms * r.latency_cnt for r in rows),
                            'cnt': sum(r.latency_cnt for r in rows)}),
            'p99': None,
        },
        'tokens': {
            'input': sum(r.tokens_in for r in rows),
            'output': sum(r.tokens_out for r in rows),
            'total': sum(r.tokens_in + r.tokens_out for r in rows),
        },
        'estimated_cost_usd': round(sum(r.cost_usd for r in rows), 6),
        'error_breakdown': dict(sorted(error_counts.items(), key=lambda kv: -kv[1])),
        'guardrail_hits_today': {},  # guardrails stay live-read (global scope only)
        'by_label': [
            {
                'label': label,
                'calls': a['calls'],
                'success_rate': round(a['success'] / a['calls'], 4) if a['calls'] else None,
                'p95_latency_ms': _p95_of(a),
                'total_tokens': a['tokens'],
                'cost_usd': round(a['cost'], 6),
                'p95_ttft_ms': None,  # ttft not rolled up — trace path only
                'prompt_version': None,
            }
            for label, a in sorted(
                label_agg.items(), key=lambda kv: kv[1]['calls'], reverse=True,
            )[:by_label_limit]
        ],
        'series': [
            {
                'bucket': key,
                'calls': b['calls'],
                'success_rate': round(b['success'] / b['calls'], 4) if b['calls'] else None,
                'p95_latency_ms': None,  # per-day p95 needs sample storage — omitted
                'cost_usd': round(b['cost'], 6),
            }
            for key, b in sorted(day_agg.items())
        ],
        'by_provider': {
            name: {
                'calls': a['calls'],
                'success_rate': round(a['success'] / a['calls'], 4) if a['calls'] else None,
                'p95_latency_ms': _p95_of(a),
            }
            for name, a in sorted(provider_agg.items(), key=lambda kv: -kv[1]['calls'])
        },
        'by_model': {},  # not a rollup dimension — see docstring
        'fallback': {
            'used': sum(r.fallbacks for r in rows),
            'total': total,
        },
        '_source': 'rollup',
    }


async def prune_rollup(
    session: AsyncSession,
    *,
    retention_days: int = ROLLUP_RETENTION_DAYS,
) -> int:
    """Delete rollup rows past retention (derived data; 90d default)."""
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    result = await session.execute(
        delete(LLMMetricsRollup).where(LLMMetricsRollup.hour < _hour_bucket(cutoff)),
    )
    await session.commit()
    return result.rowcount or 0
