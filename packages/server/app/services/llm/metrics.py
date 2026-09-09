"""LLM call metrics — the five minimal observability indicators (engineering-upgrade B4).

Computes, over a time window, from ``llm_call_traces`` (plus the guardrail
counters from ``app.utils.output_filter``):

1. Task success rate          — success / total (cache rows included; they
                                 succeed by definition and belong in the task view)
2. p95 (and p50/p99) latency  — fresh calls only (cache rows are ~0ms and
                                 would deflate percentiles)
3. Token cost per task        — input/output/total tokens + estimated USD
4. Failure classification     — counts by the stable ``error_type`` enum
5. Guardrail trigger rate     — PII-redaction + harmful-block hits per day

plus a per-label breakdown (top labels by call volume) for drilling into
which feature drives cost/latency. Percentiles are computed Python-side on
purpose: SQLite (test) lacks ``percentile_cont``, and window sizes here are
bounded by the ``MAX_METRICS_WINDOW_HOURS`` cap.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, UTC
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_trace import LLMCallTrace

MAX_METRICS_WINDOW_HOURS = 720  # 30 days hard cap — protects the row scan
MAX_LABEL_BREAKDOWN = 10


def _percentile(sorted_values: list[int], pct: float) -> int | None:
    """Nearest-rank percentile over pre-sorted values. None when empty."""
    if not sorted_values:
        return None
    idx = min(
        int(round(pct / 100 * (len(sorted_values) - 1))),
        len(sorted_values) - 1,
    )
    return sorted_values[idx]


async def compute_llm_metrics(
    *,
    hours: int = 24,
    session: AsyncSession | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Aggregate the five minimal indicators over the last ``hours``.

    ``session`` is injectable so tests run against the test database instead
    of silently reaching the configured app database; production callers
    (the router) pass the request-scoped session via ``Depends(get_db)``.

    Scope (24h-review R2): by default the aggregation is scoped to
    ``user_id`` — the metrics endpoint serves any authenticated user and
    the codebase has no admin role, so platform-wide success rates / token
    spend must not leak to every account. Set LLM_METRICS_SCOPE=global to
    run the endpoint as an ops console over all users (single-operator
    deployments).
    """
    hours = max(1, min(hours, MAX_METRICS_WINDOW_HOURS))
    since = datetime.now(UTC) - timedelta(hours=hours)

    # Unset user_id => global scope is only honored for ops-configured
    # deployments; otherwise an anonymous scope falls back to user filter
    # with no rows (safe default: show nothing rather than everything).
    global_scope = (
        os.environ.get('LLM_METRICS_SCOPE', '').strip().lower() == 'global'
    )

    # F3 (24h-review follow-up): hard cap on rows pulled for in-memory
    # percentiles — global scope over a long retention window is bounded
    # by this, not by the table size. Percentiles become an approximation
    # of the most recent MAX_METRICS_ROWS calls, documented via the flag.
    MAX_METRICS_ROWS = 100_000

    def _query():
        q = select(
            LLMCallTrace.label,
            LLMCallTrace.latency_ms,
            LLMCallTrace.success,
            LLMCallTrace.cache_hit,
            LLMCallTrace.prompt_tokens,
            LLMCallTrace.completion_tokens,
            LLMCallTrace.total_tokens,
            LLMCallTrace.estimated_cost_usd,
            LLMCallTrace.error_type,
        ).where(LLMCallTrace.created_at >= since)
        if not global_scope:
            q = q.where(LLMCallTrace.user_id == user_id)
        return q.order_by(LLMCallTrace.created_at.desc()).limit(MAX_METRICS_ROWS)

    if session is not None:
        rows = (await session.execute(_query())).all()
    else:
        from app.db import async_session

        async with async_session() as own:
            rows = (await own.execute(_query())).all()

    total = len(rows)
    fresh = [r for r in rows if not r.cache_hit]
    successes = sum(1 for r in rows if r.success)
    latencies = sorted(r.latency_ms for r in fresh if r.success)

    error_counts: dict[str, int] = {}
    for r in rows:
        if not r.success:
            key = r.error_type or 'unknown'
            error_counts[key] = error_counts.get(key, 0) + 1

    label_agg: dict[str, dict[str, Any]] = {}
    for r in rows:
        agg = label_agg.setdefault(
            r.label, {'calls': 0, 'success': 0, 'latencies': [], 'tokens': 0},
        )
        agg['calls'] += 1
        agg['success'] += 1 if r.success else 0
        if r.success and not r.cache_hit:
            agg['latencies'].append(r.latency_ms)
        agg['tokens'] += r.total_tokens or 0

    by_label = [
        {
            'label': label,
            'calls': agg['calls'],
            'success_rate': round(agg['success'] / agg['calls'], 4),
            'p95_latency_ms': _percentile(sorted(agg['latencies']), 95),
            'total_tokens': agg['tokens'],
        }
        for label, agg in sorted(
            label_agg.items(), key=lambda kv: kv[1]['calls'], reverse=True,
        )[:MAX_LABEL_BREAKDOWN]
    ]

    # F2 (24h-review follow-up): the guardrail counters are platform-wide
    # (Redis day-keys + process memory, no user dimension), so they are
    # only surfaced in the ops/global scope — a user-scoped response must
    # not leak the platform's daily PII/harmful block totals.
    guardrails: dict[str, int] = {}
    if global_scope:
        from app.utils.output_filter import read_guardrail_hits
        guardrails = await read_guardrail_hits(days=1)

    return {
        'window_hours': hours,
        'generated_at': datetime.now(UTC).isoformat(timespec='seconds'),
        'total_calls': total,
        'fresh_calls': len(fresh),
        'cache_hit_rate': round((total - len(fresh)) / total, 4) if total else None,
        'success_rate': round(successes / total, 4) if total else None,
        'latency_ms': {
            'p50': _percentile(latencies, 50),
            'p95': _percentile(latencies, 95),
            'p99': _percentile(latencies, 99),
        },
        'tokens': {
            'input': sum(r.prompt_tokens or 0 for r in rows),
            'output': sum(r.completion_tokens or 0 for r in rows),
            'total': sum(r.total_tokens or 0 for r in rows),
        },
        'estimated_cost_usd': round(
            sum(r.estimated_cost_usd or 0.0 for r in rows), 6,
        ),
        'error_breakdown': dict(
            sorted(error_counts.items(), key=lambda kv: -kv[1]),
        ),
        'guardrail_hits_today': guardrails,
        'by_label': by_label,
    }
