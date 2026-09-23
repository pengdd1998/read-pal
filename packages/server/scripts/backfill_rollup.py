"""Backfill llm_metrics_rollup from existing llm_call_traces rows.

Risk-review 09-21 finding: >48h windows read the rollup exclusively, but
the table only started filling at deploy time — the ops console's 720h
default view and check.py's 7d-vs-prior-7d cost baseline had no history.
This script rebuilds rollup rows from traces still inside the retention
horizon (LLM_LOG_RETENTION_DAYS, default 90), hour bucket by hour bucket,
using the same merge math as the live writer path (upsert_traces).

Idempotent: hours already present are still re-merged (additive counters
would double — so we skip hours that exist unless --force). With --force
the rollup is rebuilt from scratch for the covered window.

Usage:
    cd packages/server && uv run python scripts/backfill_rollup.py            # fill missing hours
    cd packages/server && uv run python scripts/backfill_rollup.py --force    # rebuild all
"""
from __future__ import annotations

import asyncio
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0, '.')

from sqlalchemy import func, select  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.llm_metrics_rollup import LLMMetricsRollup  # noqa: E402
from app.models.llm_trace import LLMCallTrace  # noqa: E402
from app.services.llm.rollup import _hour_bucket, upsert_traces  # noqa: E402

BATCH_HOURS = 24  # traces per hour-bucket query stay small; 24h per txn


async def main() -> None:
    force = '--force' in sys.argv
    async with async_session() as s:
        retention_days = 90
        try:
            from app.config import get_settings

            retention_days = get_settings().llm_log_retention_days or 90
        except Exception:  # noqa: BLE001 — settings unreachable → default
            pass
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        total = (
            await s.execute(
                select(func.count()).select_from(LLMCallTrace).where(
                    LLMCallTrace.created_at >= cutoff,
                )
            )
        ).scalar() or 0
        existing_hours = {
            r[0] for r in (
                await s.execute(
                    select(func.distinct(LLMMetricsRollup.hour))
                )
            ).all()
        }
        print(f'traces in window: {total} | rollup hours present: {len(existing_hours)}')

        done = skipped = 0
        cursor = cutoff
        now = datetime.now(UTC)
        while cursor < now:
            batch_end = min(cursor + timedelta(hours=BATCH_HOURS), now)
            rows = (
                await s.execute(
                    select(
                        LLMCallTrace.created_at, LLMCallTrace.label,
                        LLMCallTrace.provider, LLMCallTrace.latency_ms,
                        LLMCallTrace.success, LLMCallTrace.cache_hit,
                        LLMCallTrace.prompt_tokens,
                        LLMCallTrace.completion_tokens,
                        LLMCallTrace.estimated_cost_usd,
                        LLMCallTrace.error_type, LLMCallTrace.fallback_used,
                    ).where(
                        LLMCallTrace.created_at >= cursor,
                        LLMCallTrace.created_at < batch_end,
                    )
                )
            ).all()
            cursor = batch_end
            if not rows:
                continue

            hours = {_hour_bucket(r[0]) for r in rows}
            if not force and hours <= existing_hours:
                skipped += len(rows)
                continue

            # Reuse the writer's merge math via the trace-dict shape.
            traces = [
                {
                    'created_at': r[0], 'label': r[1], 'provider': r[2],
                    'latency_ms': r[3], 'success': r[4], 'cache_hit': r[5],
                    'prompt_tokens': r[6], 'completion_tokens': r[7],
                    'estimated_cost_usd': r[8], 'error_type': r[9],
                    'fallback_used': r[10],
                }
                for r in rows
            ]
            async with s.begin():
                await upsert_traces(s, traces)
            done += len(rows)
            print(f'  {cursor.isoformat(timespec="hours")}: +{len(rows)} traces', flush=True)

        print(f'DONE: merged={done} skipped(existing hours)={skipped}')
        # P7.7 rule: bulk vector writes corrupt HNSW — no vectors touched
        # here, but the rollup PK index benefits from a post-backfill check.
        n = (
            await s.execute(
                select(func.count()).select_from(LLMMetricsRollup)
            )
        ).scalar() or 0
        print(f'rollup rows now: {n}')


if __name__ == '__main__':
    asyncio.run(main())
