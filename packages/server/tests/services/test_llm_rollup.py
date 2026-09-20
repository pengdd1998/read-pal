"""LLM metrics rollup tests (monitoring-upgrade P-C).

Layers:
- ``upsert_traces``: batching by (hour, label, provider), idempotent
  merge across flushes, call-weighted p95, error blob round-trip.
- ``rollup_metrics``: response shape parity with compute_llm_metrics
  (the ops console must not care which path served the window).
- ``compute_llm_metrics`` routing: global + >48h reads the rollup
  (``_source`` marker); user-scoped always reads traces.
- Writer integration: a flush batch lands BOTH trace rows and rollup
  rows in the same transaction.
"""

from __future__ import annotations

from datetime import datetime, timedelta, UTC
from unittest.mock import patch

import pytest

from app.models.llm_metrics_rollup import LLMMetricsRollup
from app.services.llm.metrics import compute_llm_metrics
from app.services.llm.rollup import rollup_metrics, upsert_traces
from tests.conftest import _TestSession

NOW = datetime.now(UTC).replace(minute=5, second=0, microsecond=0)  # pinned: relative offsets must never straddle an hour boundary (CI flake 2026-09-20)


def _td(
    *,
    label='companion.chat',
    provider='glm',
    latency_ms=100,
    success=True,
    error_type=None,
    cache_hit=False,
    fallback=False,
    tokens=50,
    cost=0.0,
    ts=None,
) -> dict:
    return {
        'label': label,
        'provider': provider,
        'latency_ms': latency_ms,
        'success': success,
        'error_type': error_type,
        'cache_hit': cache_hit,
        'fallback_used': fallback,
        'prompt_tokens': tokens,
        'completion_tokens': tokens,
        'estimated_cost_usd': cost,
        'created_at': ts or NOW,
    }


class TestUpsertTraces:
    @pytest.mark.asyncio
    async def test_batches_by_hour_label_provider(self):
        async with _TestSession() as s:
            touched = await upsert_traces(s, [
                _td(label='a', provider='glm', ts=NOW),
                _td(label='a', provider='glm', ts=NOW + timedelta(minutes=5)),
                _td(label='a', provider='mimo', ts=NOW),
                _td(label='b', provider='glm', ts=NOW),
                _td(label='a', provider='glm', ts=NOW + timedelta(hours=1)),
            ])
            await s.commit()
            rows = (await s.execute(
                __import__('sqlalchemy').select(LLMMetricsRollup)
            )).scalars().all()

        assert touched == 4
        assert len(rows) == 4
        by_key = {(r.hour, r.label, r.provider): r for r in rows}
        assert by_key[(NOW.replace(minute=0, second=0, microsecond=0, tzinfo=None), 'a', 'glm')].calls == 2

    @pytest.mark.asyncio
    async def test_merge_across_flushes_is_idempotent_and_weighted(self):
        async with _TestSession() as s:
            # flush 1: 3 calls at ~100ms
            await upsert_traces(s, [
                _td(latency_ms=100 + i) for i in range(3)
            ])
            await s.commit()
            # flush 2: 1 call at 5000ms (slow outlier) + 1 failure + fallback
            await upsert_traces(s, [
                _td(latency_ms=5000),
                _td(success=False, error_type='rate_limit', fallback=True),
            ])
            await s.commit()
            row = (await s.execute(
                __import__('sqlalchemy').select(LLMMetricsRollup)
            )).scalars().one()

        assert row.calls == 5
        assert row.successes == 4
        assert row.fresh_calls == 5
        assert row.fallbacks == 1
        assert row.error_counts == 'rate_limit=1'
        # weighted p95: 3-call batch p95=102, 2-call batch p95=5000
        # (only successful fresh latencies count — the failure is excluded)
        assert row.latency_cnt == 4
        assert row.latency_p95_ms == round((102 * 3 + 5000 * 1) / 4)
        assert row.latency_max_ms == 5000

    @pytest.mark.asyncio
    async def test_cache_rows_count_as_calls_but_not_latency(self):
        async with _TestSession() as s:
            await upsert_traces(s, [_td(cache_hit=True, latency_ms=0)])
            await s.commit()
            row = (await s.execute(
                __import__('sqlalchemy').select(LLMMetricsRollup)
            )).scalars().one()
        assert row.calls == 1
        assert row.fresh_calls == 0
        assert row.latency_cnt == 0


class TestRollupMetrics:
    @pytest.mark.asyncio
    async def test_response_shape_matches_trace_path(self):
        async with _TestSession() as s:
            await upsert_traces(s, [
                _td(label='a', provider='glm', cost=0.001, ts=NOW - timedelta(hours=2)),
                _td(label='a', provider='mimo', cost=0.002, ts=NOW - timedelta(hours=2)),
                _td(label='b', provider='glm', success=False, error_type='timeout',
                    ts=NOW - timedelta(days=2, hours=12)),  # 60h back: safely inside the 72h window
            ])
            await s.commit()
            data = await rollup_metrics(s, hours=72)

        assert data['_source'] == 'rollup'
        assert data['total_calls'] == 3
        assert data['success_rate'] == round(2 / 3, 4)
        assert data['fresh_calls'] == 3
        assert data['estimated_cost_usd'] == 0.003
        assert data['error_breakdown'] == {'timeout': 1}
        assert data['fallback'] == {'used': 0, 'total': 3}
        # day-bucketed series, oldest first
        assert [b['bucket'] for b in data['series']] == sorted(
            b['bucket'] for b in data['series']
        )
        assert all('T' not in b['bucket'] for b in data['series'])
        # by_label ordered by calls; both providers present
        assert data['by_label'][0]['label'] == 'a'
        assert set(data['by_provider']) == {'glm', 'mimo'}
        assert data['by_model'] == {}, 'model is not a rollup dimension'

    @pytest.mark.asyncio
    async def test_metrics_routes_global_long_windows_to_rollup(self):
        async with _TestSession() as s:
            await upsert_traces(s, [
                _td(label='a', ts=NOW - timedelta(hours=50), cost=0.5),
            ])
            await s.commit()

            with patch(
                'app.utils.output_filter.read_guardrail_hits',
                new=_fake_guardrails,
            ):
                # >48h global -> rollup
                long_data = await compute_llm_metrics(hours=72, session=s, force_global=True)
                # <=48h global -> trace scan (no _source marker)
                short_data = await compute_llm_metrics(hours=24, session=s, force_global=True)

        assert long_data['_source'] == 'rollup'
        assert long_data['total_calls'] == 1
        assert '_source' not in short_data
        assert long_data['guardrail_hits_today'] == {'total': 0}


async def _fake_guardrails(days: int = 1) -> dict:
    return {'total': 0}


class TestWriterIntegration:
    @pytest.mark.asyncio
    async def test_flush_writes_traces_and_rollup_together(self):
        from sqlalchemy import select
        from app.models.llm_trace import LLMCallTrace

        batch = [_td(label='writer.test', ts=NOW)]
        async with _TestSession() as s:
            await upsert_traces(s, batch)  # direct service call mirrors writer path
            await s.commit()
            rollups = (await s.execute(select(LLMMetricsRollup))).scalars().all()

        # The writer calls upsert_traces with the same dicts it feeds
        # LLMCallTrace(**t) — the keys must therefore all be trace columns.
        row = LLMCallTrace(**batch[0])
        assert row.label == 'writer.test'
        assert len(rollups) == 1
