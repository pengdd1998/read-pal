"""Tests for LLM metrics + guardrail counters (engineering-upgrade B4)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, UTC

import pytest

from tests.conftest import _TestSession, auth_headers, register_user

from app.models.llm_trace import LLMCallTrace
from app.utils.output_filter import (
    _memory_guardrail_counts,
    filter_output,
    read_guardrail_hits,
)


def _trace(
    *,
    label: str = 'companion.chat',
    latency_ms: int = 100,
    success: bool = True,
    error_type: str | None = None,
    cache_hit: bool = False,
    user_id: str | None = None,
    tokens: int = 100,
    created_at: datetime | None = None,
) -> LLMCallTrace:
    return LLMCallTrace(
        request_id='r' * 12,
        model='glm-4.7-flash',
        label=label,
        user_id=user_id,
        latency_ms=latency_ms,
        prompt_tokens=tokens,
        completion_tokens=tokens,
        total_tokens=tokens * 2,
        estimated_cost_usd=0.0,
        success=success,
        error_type=error_type,
        cache_hit=cache_hit,
        created_at=created_at or datetime.now(UTC),
    )


class TestComputeLLMMetrics:
    async def test_five_indicators_over_seeded_rows(self):
        now = datetime.now(UTC)
        async with _TestSession() as session:
            session.add_all([
                # 8 successes at 100..800ms (fresh)
                *[_trace(latency_ms=100 * i, tokens=10) for i in range(1, 9)],
                # 1 failure classified rate_limit
                _trace(success=False, error_type='rate_limit', latency_ms=50),
                # 1 cache hit (excluded from latency percentiles, included in totals)
                _trace(cache_hit=True, latency_ms=0, tokens=0),
                # 1 row outside the 24h window — must be excluded
                _trace(created_at=now - timedelta(hours=30), tokens=999),
            ])
            await session.commit()

            from app.services.llm.metrics import compute_llm_metrics

            data = await compute_llm_metrics(hours=24, session=session)
        assert data['total_calls'] == 10
        assert data['success_rate'] == 0.9  # 9/10
        assert data['error_breakdown'] == {'rate_limit': 1}
        assert data['latency_ms']['p50'] == 500  # nearest-rank (round-half) over 100..800
        assert data['latency_ms']['p95'] == 800
        assert data['tokens']['total'] == 8 * 20 + 200 + 0  # fresh(10->20 each) + failed(default 100->200) + cache(0)
        assert data['by_label'][0]['label'] == 'companion.chat'
        assert data['by_label'][0]['calls'] == 10

    async def test_empty_window_returns_nulls_not_errors(self):
        from app.services.llm.metrics import compute_llm_metrics

        async with _TestSession() as session:
            session.add_all([_trace(created_at=datetime.now(UTC) - timedelta(days=3))])
            await session.commit()

            data = await compute_llm_metrics(hours=1, session=session)
        assert data['total_calls'] == 0
        assert data['success_rate'] is None
        assert data['latency_ms']['p95'] is None

    async def test_window_capped_at_max(self):
        from app.services.llm.metrics import MAX_METRICS_WINDOW_HOURS, compute_llm_metrics

        async with _TestSession() as session:
            data = await compute_llm_metrics(hours=100_000, session=session)
        assert data['window_hours'] == MAX_METRICS_WINDOW_HOURS


class TestGuardrailCounters:
    async def test_pii_hit_counted(self):
        _memory_guardrail_counts.clear()
        filtered = filter_output('contact me at john.doe@example.com', context='t')
        assert '[REDACTED_EMAIL]' in filtered
        hits = await read_guardrail_hits(days=1)
        # Hermetic Redis (get -> None): the read is memory-only, and the
        # async INCR always fails -> no payback. EXACTLY one hit, not >=1 —
        # the >= form masked the double-count bug (24h-review R1).
        assert hits['pii'] == 1

    async def test_harmful_hit_counted_and_blocked(self):
        _memory_guardrail_counts.clear()
        filtered = filter_output('how to kill yourself', context='t')
        assert filtered  # safety fallback returned
        hits = await read_guardrail_hits(days=1)
        assert hits['harmful'] == 1

    async def test_clean_text_no_hits(self):
        _memory_guardrail_counts.clear()
        filter_output('The green light symbolizes hope.', context='t')
        hits = await read_guardrail_hits(days=1)
        assert hits['total'] == 0


class TestMetricsEndpoint:
    async def test_requires_auth(self, client):
        resp = await client.get('/api/v1/stats/llm')
        assert resp.status_code in (401, 403)

    async def test_rejects_bad_window(self, client):
        user = await register_user(client)
        headers = auth_headers(user['token'])
        assert (await client.get('/api/v1/stats/llm?hours=0', headers=headers)).status_code == 422
        assert (await client.get('/api/v1/stats/llm?hours=999999', headers=headers)).status_code == 422

    async def test_returns_indicators_scoped_to_requester(self, client):
        """24h-review R2: metrics are USER-scoped by default — another
        user's traces must be invisible, the requester's fully counted."""
        user = await register_user(client)
        stranger = await register_user(client, email='stranger@example.com')
        headers = auth_headers(user['token'])
        async with _TestSession() as session:
            session.add_all([
                _trace(label='flashcard.generate', latency_ms=120, tokens=5,
                       user_id=str(user['user']['id'])),
                _trace(label='flashcard.generate', success=False,
                       error_type='timeout', latency_ms=15_000, tokens=5,
                       user_id=str(user['user']['id'])),
                # stranger's rows: must NOT appear in user's metrics
                _trace(label='flashcard.generate', latency_ms=999, tokens=99,
                       user_id=str(stranger['user']['id'])),
            ])
            await session.commit()

        resp = await client.get('/api/v1/stats/llm?hours=24', headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body['success'] is True
        data = body['data']
        assert data['total_calls'] == 2
        assert data['error_breakdown'] == {'timeout': 1}
        for key in ('success_rate', 'latency_ms', 'tokens',
                    'guardrail_hits_today'):
            assert key in data

    async def test_global_scope_env_flag(self, client, monkeypatch):
        """LLM_METRICS_SCOPE=global turns the endpoint into an ops console
        over all users' traces."""
        user = await register_user(client)
        stranger = await register_user(client, email='stranger@example.com')
        headers = auth_headers(user['token'])
        async with _TestSession() as session:
            session.add_all([
                _trace(label='l', latency_ms=1, tokens=1,
                       user_id=str(user['user']['id'])),
                _trace(label='l', latency_ms=1, tokens=1,
                       user_id=str(stranger['user']['id'])),
            ])
            await session.commit()

        monkeypatch.setenv('LLM_METRICS_SCOPE', 'global')
        resp = await client.get('/api/v1/stats/llm?hours=24', headers=headers)
        assert resp.status_code == 200
        assert resp.json()['data']['total_calls'] == 2


class TestGuardrailNoDoubleCount:
    """24h-review R1: a successful Redis INCR must pay back the in-memory
    pending count — read_guardrail_hits sums both sides, so a missing
    payback doubled every metric."""

    @pytest.mark.asyncio
    async def test_successful_incr_pays_back_memory(self, monkeypatch):
        from app.utils import output_filter as of

        class FakeRedis:
            def __init__(self):
                self.store = {}

            async def incr(self, key):
                self.store[key] = self.store.get(key, 0) + 1
                return self.store[key]

            async def expire(self, key, ttl):
                return True

            async def get(self, key):
                return self.store.get(key)

        fake = FakeRedis()
        monkeypatch.setattr('app.core.redis.get_redis', lambda: fake)
        of._memory_guardrail_counts.clear()
        of._count_guardrail_hit('pii')
        # let the fire-and-forget task run
        for _ in range(5):
            await asyncio.sleep(0)
        hits = await of.read_guardrail_hits(days=1)
        assert hits['pii'] == 1, f'double-counted: {hits}'
        assert fake.store, 'redis never incremented'

    @pytest.mark.asyncio
    async def test_failed_incr_keeps_memory_fallback(self, monkeypatch):
        from app.utils import output_filter as of

        class BrokenRedis:
            async def incr(self, key):
                raise ConnectionError('down')

            async def expire(self, key, ttl):
                return True

            async def get(self, key):
                return None

        monkeypatch.setattr('app.core.redis.get_redis', lambda: BrokenRedis())
        of._memory_guardrail_counts.clear()
        of._count_guardrail_hit('pii')
        for _ in range(5):
            await asyncio.sleep(0)
        hits = await of.read_guardrail_hits(days=1)
        assert hits['pii'] == 1, 'memory fallback lost the hit'
