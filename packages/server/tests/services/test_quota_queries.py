"""H5a (P-H): platform quota snapshot — today/yesterday aggregates.

The card replaced the (live-verified 404) Zhipu balance probe; these tests
pin the owned-data semantics: UTC-day bucketing, cache_hit exclusion,
top-consumer digests, and the soft budget ratio.

Time anchors are midnight-safe: "today" rows are minutes old, "yesterday"
rows sit beyond the current UTC-midnight distance plus slack — the test
runs correctly at any hour (a first draft used fixed hours-ago offsets and
silently crossed UTC midnight right after 00:00 UTC).
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.llm_trace import LLMCallTrace
from app.services.llm.quota_queries import platform_quota_snapshot
from tests.conftest import _TestSession


def _hours_since_utc_midnight(now: datetime) -> float:
    midnight = datetime(now.astimezone(timezone.utc).date().year,
                         now.astimezone(timezone.utc).date().month,
                         now.astimezone(timezone.utc).date().day, tzinfo=timezone.utc)
    return (now.astimezone(timezone.utc) - midnight).total_seconds() / 3600


def _trace(*, hours_ago: float, user: str | None = 'u1', tokens: int = 100,
           cost: float = 0.001, cache_hit: bool = False) -> LLMCallTrace:
    return LLMCallTrace(
        request_id=uuid4().hex[:12],
        http_request_id=None,
        label='test.quota',
        provider='glm',
        model='glm-4.7-flash',
        user_id=user,
        created_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
        latency_ms=100.0,
        success=True,
        prompt_tokens=tokens // 2,
        completion_tokens=tokens // 2,
        total_tokens=tokens,
        estimated_cost_usd=cost,
        cache_hit=cache_hit,
    )


@pytest.mark.asyncio
async def test_today_vs_yesterday_and_top_users():
    async with _TestSession() as db:
        now = datetime.now(timezone.utc)
        since_midnight = _hours_since_utc_midnight(now)
        assert since_midnight >= 0
        rows = [
            _trace(hours_ago=0.01, user='u1', tokens=100, cost=0.001),                       # minutes ago → today
            _trace(hours_ago=0.02, user='u1', tokens=300, cost=0.003),                       # today
            _trace(hours_ago=since_midnight + 2, user='u2', tokens=1000, cost=0.01),          # safely yesterday
            _trace(hours_ago=0.01, user='u3', tokens=5000, cost=0.005, cache_hit=True),       # today, cached — excluded
        ]
        # Baseline-delta assertions: the shared test DB may carry traces
        # from other suites, so compare before/after, not absolutes.
        baseline = await platform_quota_snapshot(db)
        db.add_all(rows)
        await db.commit()

        data = await platform_quota_snapshot(db)

        assert data['today']['calls'] == baseline['today']['calls'] + 2
        assert data['today']['tokens'] == baseline['today']['tokens'] + 400
        assert data['today']['cost_usd'] == pytest.approx(baseline['today']['cost_usd'] + 0.004)
        assert data['yesterday']['tokens'] >= baseline['yesterday']['tokens'] + 1000
        assert data['yesterday']['cost_usd'] >= baseline['yesterday']['cost_usd'] + 0.01 - 1e-9
        # u1 leads today (400 added tokens); the cached u3 row (5000) is excluded
        top_tokens = sorted((u['tokens'] for u in data['top_users_today']), reverse=True)
        base_top = sorted((u['tokens'] for u in baseline['top_users_today']), reverse=True)
        added = [x - y for x, y in zip(top_tokens, base_top)] if len(top_tokens) == len(base_top) else top_tokens
        assert 400 in added or 400 in top_tokens
        assert all(len(u['user']) == 8 for u in data['top_users_today'])  # digests, not raw ids

        for r in (await db.execute(select(LLMCallTrace).where(LLMCallTrace.label == 'test.quota'))).scalars():
            await db.delete(r)
        await db.commit()


@pytest.mark.asyncio
async def test_budget_ratio_and_disabled():
    async with _TestSession() as db:
        baseline = await platform_quota_snapshot(db)
        db.add(_trace(hours_ago=0.01, user='u9', tokens=100, cost=0.50))
        await db.commit()

        from unittest.mock import patch
        with patch('app.config.get_settings') as gs:
            gs.return_value.llm_ops_daily_cost_budget_usd = 2.0
            data = await platform_quota_snapshot(db)
        assert data['cost_budget_usd'] == 2.0
        assert data['budget_used_ratio'] == pytest.approx((baseline['today']['cost_usd'] + 0.50) / 2.0)

        with patch('app.config.get_settings') as gs:
            gs.return_value.llm_ops_daily_cost_budget_usd = 0.0
            data = await platform_quota_snapshot(db)
        assert data['budget_used_ratio'] is None

        for r in (await db.execute(select(LLMCallTrace).where(LLMCallTrace.label == 'test.quota'))).scalars():
            await db.delete(r)
        await db.commit()
