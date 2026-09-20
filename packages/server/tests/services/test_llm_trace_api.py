"""Row-level trace API + metrics P-A additions (monitoring-upgrade 2026-09-20).

Layers:
- ``list_llm_traces`` / ``get_trace_chain`` service contracts: filters,
  pagination, user hashing, chain latency math.
- Router (ops-only): 403 without/with-wrong X-Ops-Key, 200 with valid key;
  chain 404 on unknown id; the aggregate endpoint keeps its user-scoped
  fallback and gains the P-A fields.
- Circuit-breaker transition ring buffer + provider snapshot TPM fields.
"""

from __future__ import annotations

from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, patch

import pytest

from app.middleware.ops_auth import ops_key_valid
from app.models.llm_trace import LLMCallTrace
from app.services.llm.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    _TRANSITION_HISTORY,
    recent_transitions,
)
from app.services.llm.metrics import compute_llm_metrics
from app.services.llm.trace_queries import get_trace_chain, list_llm_traces, short_uid
from tests.conftest import _TestSession, auth_headers, register_user

OPS_KEY = 'test-ops-key-zj'


def _trace(
    *,
    label: str = 'companion.chat',
    http_request_id: str | None = 'chain-1',
    request_id: str = 'req000000001',
    latency_ms: int = 100,
    success: bool = True,
    error_type: str | None = None,
    provider: str | None = 'glm',
    model: str = 'glm-4.7-flash',
    fallback_used: bool = False,
    ttft_ms: int | None = None,
    prompt_version: str | None = 'v1',
    user_id: str | None = 'user-aaaaaaaa',
    created_at: datetime | None = None,
    cost: float = 0.0,
) -> LLMCallTrace:
    return LLMCallTrace(
        request_id=request_id,
        model=model,
        label=label,
        user_id=user_id,
        latency_ms=latency_ms,
        prompt_tokens=10,
        completion_tokens=20,
        total_tokens=30,
        estimated_cost_usd=cost,
        success=success,
        error_type=error_type,
        provider=provider,
        fallback_used=fallback_used,
        ttft_ms=ttft_ms,
        prompt_version=prompt_version,
        http_request_id=http_request_id,
        created_at=created_at or datetime.now(UTC),
    )


async def _seed_chain(session) -> None:
    """One SSE turn: tool call -> failed primary -> fallback answer."""
    base = datetime.now(UTC) - timedelta(minutes=5)
    session.add_all([
        _trace(
            label='companion.tool', request_id='tool-0000001',
            latency_ms=150, ttft_ms=90, http_request_id='chain-1',
            created_at=base,
        ),
        _trace(
            label='companion.chat', request_id='chat0000001',
            latency_ms=76_000, success=False, error_type='rate_limit',
            provider='glm', http_request_id='chain-1',
            created_at=base + timedelta(seconds=1),
        ),
        _trace(
            label='companion.chat', request_id='chat0000002',
            latency_ms=27_000, provider='mimo', model='mimo-v2.5',
            fallback_used=True, ttft_ms=800, cost=0.0002,
            http_request_id='chain-1',
            created_at=base + timedelta(seconds=77),
        ),
        # unrelated turn — must never leak into chain-1
        _trace(
            label='synthesis', request_id='syn00000001',
            latency_ms=50, http_request_id='chain-2',
            created_at=base + timedelta(seconds=200),
        ),
    ])


# ---------------------------------------------------------------------------
# service: list + chain
# ---------------------------------------------------------------------------


class TestListTraces:
    @pytest.mark.asyncio
    async def test_filters_and_pagination(self):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()

            page = await list_llm_traces(session, hours=1, limit=2, offset=0)
            assert page['total'] == 4
            assert len(page['items']) == 2
            assert page['items'][0]['ts'] >= page['items'][1]['ts'], 'newest first'

            failures = await list_llm_traces(session, hours=1, success=False)
            assert failures['total'] == 1
            assert failures['items'][0]['error_type'] == 'rate_limit'

            by_label = await list_llm_traces(session, hours=1, label='companion.chat')
            assert by_label['total'] == 2

            by_prefix = await list_llm_traces(session, hours=1, request_prefix='chain-2')
            assert by_prefix['total'] == 1
            assert by_prefix['items'][0]['label'] == 'synthesis'

    @pytest.mark.asyncio
    async def test_user_ids_are_hashed_never_raw(self):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()
            page = await list_llm_traces(session, hours=1)
        for item in page['items']:
            assert item['user'] == short_uid('user-aaaaaaaa')
            assert 'user-aaaaaaaa' not in str(item)


class TestTraceChain:
    @pytest.mark.asyncio
    async def test_chain_aggregates_one_sse_turn(self):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()
            chain = await get_trace_chain(session, 'chain-1')

        assert chain is not None
        assert chain['span_count'] == 3
        assert chain['labels'] == ['companion.chat', 'companion.tool']
        assert set(chain['providers']) == {'glm', 'mimo'}
        assert chain['has_fallback'] is True
        assert chain['all_success'] is False
        # oldest-first spans, unrelated chain-2 excluded
        assert [s['request_id'] for s in chain['spans']] == [
            'tool-0000001', 'chat0000001', 'chat0000002',
        ]
        # chain latency: from the earliest span start to the latest span
        # finish (1s + 76s failed + 27s fallback, overlapping start) —
        # 77s offset + 27s span = 104_000ms window, not the 103s sum of
        # serial latencies.
        assert chain['chain_latency_ms'] == 104_000

    @pytest.mark.asyncio
    async def test_unknown_chain_returns_none(self):
        async with _TestSession() as session:
            assert await get_trace_chain(session, 'nope') is None


# ---------------------------------------------------------------------------
# router: ops-key gate
# ---------------------------------------------------------------------------


class TestTraceRouter:
    @pytest.fixture
    def ops_env(self, monkeypatch):
        monkeypatch.setenv('OPS_KEY', OPS_KEY)

    @pytest.mark.asyncio
    async def test_requests_requires_ops_key(self, client, ops_env):
        reg = await register_user(client)
        resp = await client.get(
            '/api/v1/stats/llm/requests',
            headers=auth_headers(reg['token']),
        )
        assert resp.status_code == 403

        resp = await client.get(
            '/api/v1/stats/llm/requests',
            headers={**auth_headers(reg['token']), 'X-Ops-Key': 'wrong-key'},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_requests_with_valid_key_lists_rows(self, client, ops_env):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()

        reg = await register_user(client)
        resp = await client.get(
            '/api/v1/stats/llm/requests?success=false',
            headers={**auth_headers(reg['token']), 'X-Ops-Key': OPS_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()['data']
        assert data['total'] == 1
        assert data['items'][0]['error_type'] == 'rate_limit'

    @pytest.mark.asyncio
    async def test_chain_detail_and_404(self, client, ops_env):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()

        reg = await register_user(client)
        headers = {**auth_headers(reg['token']), 'X-Ops-Key': OPS_KEY}

        ok = await client.get('/api/v1/stats/llm/requests/chain-1', headers=headers)
        assert ok.status_code == 200
        assert ok.json()['data']['span_count'] == 3

        missing = await client.get('/api/v1/stats/llm/requests/nope', headers=headers)
        assert missing.status_code == 404

    @pytest.mark.asyncio
    async def test_aggregate_endpoint_keeps_user_scope_and_gains_fields(self, client, monkeypatch):
        monkeypatch.delenv('OPS_KEY', raising=False)
        async with _TestSession() as session:
            session.add(_trace(user_id=None, cost=0.001))
            await session.commit()

        reg = await register_user(client)
        resp = await client.get(
            '/api/v1/stats/llm?hours=1',
            headers=auth_headers(reg['token']),
        )
        assert resp.status_code == 200
        data = resp.json()['data']
        # P-A fields present on the (empty, user-scoped) response
        assert 'series' in data and 'by_provider' in data and 'fallback' in data
        assert data['total_calls'] == 0, 'user scope must not see other rows'


# ---------------------------------------------------------------------------
# metrics P-A additions
# ---------------------------------------------------------------------------


class TestMetricsAdditions:
    @pytest.mark.asyncio
    async def test_series_buckets_by_hour_then_day(self):
        now = datetime.now(UTC)
        async with _TestSession() as session:
            session.add_all([
                _trace(http_request_id='a', created_at=now - timedelta(hours=1), cost=0.001),
                _trace(http_request_id='b', created_at=now - timedelta(hours=1)),
                _trace(
                    http_request_id='c', created_at=now - timedelta(hours=26),
                    success=False, error_type='rate_limit',
                ),
            ])
            await session.commit()

            hourly = await compute_llm_metrics(hours=24, session=session, user_id=None, force_global=True)
            assert len(hourly['series']) == 1
            bucket = hourly['series'][0]
            assert 'T' in bucket['bucket'], 'hourly buckets carry the hour'
            assert bucket['calls'] == 2
            assert bucket['success_rate'] == 1.0

            daily = await compute_llm_metrics(hours=72, session=session, user_id=None, force_global=True)
            assert len(daily['series']) >= 1
            assert all('T' not in b['bucket'] for b in daily['series']), '>48h window buckets by day'

    @pytest.mark.asyncio
    async def test_provider_model_fallback_and_label_enrichment(self):
        async with _TestSession() as session:
            await _seed_chain(session)
            await session.commit()
            data = await compute_llm_metrics(
                hours=1, session=session, user_id=None, force_global=True,
            )

        assert data['by_provider']['glm']['calls'] == 3  # tool + failed primary + synthesis
        assert data['by_provider']['mimo']['calls'] == 1
        assert data['by_model']['mimo-v2.5']['calls'] == 1
        assert data['fallback'] == {'used': 1, 'total': 4}

        chat = next(b for b in data['by_label'] if b['label'] == 'companion.chat')
        assert chat['cost_usd'] == 0.0002
        assert chat['p95_ttft_ms'] == 800
        assert chat['prompt_version'] == 'v1'

    @pytest.mark.asyncio
    async def test_guardrail_days_passthrough(self, monkeypatch):
        seen = {}

        async def fake_read(days: int = 1):
            seen['days'] = days
            return {'pii': 1, 'harmful': 0, 'total': 1}

        with patch('app.utils.output_filter.read_guardrail_hits', fake_read):
            await compute_llm_metrics(
                hours=1, user_id=None, force_global=True, guardrail_days=7,
            )
        assert seen['days'] == 7


# ---------------------------------------------------------------------------
# circuit ring buffer + snapshot
# ---------------------------------------------------------------------------


class TestCircuitTransitionHistory:
    @pytest.mark.asyncio
    async def test_transitions_recorded_with_provider_name(self, monkeypatch):
        monkeypatch.setattr(
            'app.services.llm.circuit_breaker.get_settings',
            lambda: type('S', (), {
                'circuit_failure_threshold': 1,
                'circuit_reset_timeout_seconds': 0,
            })(),
        )
        _TRANSITION_HISTORY.clear()
        breaker = CircuitBreaker(name='glm-test')
        await breaker.record_failure()  # threshold 1 -> OPEN
        await breaker.record_success()  # -> CLOSED
        history = recent_transitions()
        assert [(h['from'], h['to']) for h in history] == [
            ('closed', 'open'), ('open', 'closed'),
        ]
        assert all(h['provider'] == 'glm-test' for h in history)

    def test_ring_buffer_bounds_memory(self, monkeypatch):
        _TRANSITION_HISTORY.clear()
        monkeypatch.setattr(
            'app.services.llm.circuit_breaker.get_settings',
            lambda: type('S', (), {
                'circuit_failure_threshold': 1,
                'circuit_reset_timeout_seconds': 0,
            })(),
        )

        async def cycle():
            b = CircuitBreaker(name='many')
            for _ in range(60):
                await b.record_failure()
                await b.record_success()

        import asyncio
        asyncio.run(cycle())
        assert len(recent_transitions()) == 50, 'deque(maxlen=50) must bound history'


class TestOpsKeyValid:
    def test_unset_key_disables_ops_surface(self, monkeypatch):
        monkeypatch.delenv('OPS_KEY', raising=False)
        monkeypatch.setattr(
            'app.config.get_settings',
            lambda: type('S', (), {'ops_key': ''})(),
        )
        assert ops_key_valid('anything') is False
        assert ops_key_valid(None) is False
