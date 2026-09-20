"""Daily dashboard insight tests (matrix J4).

Layers:
- ``_signals_from_stats``: pure phrasing pin (sanitized title, progress,
  counts; None on empty library).
- ``get_daily_insight``: day-cache hit short-circuits the LLM; miss →
  LLM → cached; LLM degrade → ``insight: null`` without caching; empty
  library → no LLM at all.
- Wiring: prompt templates registered with declared variables.
"""

from unittest.mock import AsyncMock, patch

import pytest

import app.services.agent.insight as insight_mod
from app.prompts import ALL_TEMPLATES, INSIGHT_HUMAN, INSIGHT_SYSTEM
from app.services.agent.insight import _signals_from_stats, get_daily_insight
from tests.conftest import _TestSession
from tests.fixtures.seeds import _seed_book, _seed_user

_STATS_WITH_BOOK = {
    "recentBooks": [
        {"title": "傲慢与偏见", "progress": 0.42, "lastRead": "2026-09-20T00:00:00"},
    ],
    "booksByStatus": {"unread": 1, "reading": 1, "completed": 2},
    "stats": {"conceptsLearned": 7},
}


class _FakeRedis:
    def __init__(self, preseeded: str | None = None) -> None:
        self.store: dict[str, str] = {}
        if preseeded is not None:
            self.store["*"] = preseeded
        self.setex_calls: list[tuple[str, int, str]] = []

    async def get(self, key: str) -> str | None:
        return self.store.get(key, self.store.get("*"))

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.setex_calls.append((key, ttl, value))
        self.store[key] = value


def _patch_stats(monkeypatch, stats: dict) -> None:
    monkeypatch.setattr(
        insight_mod, "get_dashboard_stats", AsyncMock(return_value=stats)
    )


# ---------------------------------------------------------------------------
# signals block
# ---------------------------------------------------------------------------


class TestSignalsFromStats:
    def test_empty_library_yields_none(self):
        assert _signals_from_stats({"recentBooks": []}) is None

    def test_signals_carry_title_progress_and_counts(self):
        signals = _signals_from_stats(_STATS_WITH_BOOK)
        assert signals is not None
        assert "傲慢与偏见" in signals
        assert "42%" in signals
        assert "annotations saved so far: 7" in signals
        assert "books in library: 4" in signals


# ---------------------------------------------------------------------------
# get_daily_insight
# ---------------------------------------------------------------------------


class TestGetDailyInsight:
    @pytest.mark.asyncio
    async def test_empty_library_skips_llm_and_cache(self, monkeypatch):
        _patch_stats(monkeypatch, {"recentBooks": []})
        redis = _FakeRedis()
        monkeypatch.setattr(insight_mod, "get_redis", lambda: redis)
        llm = AsyncMock()
        with patch.object(insight_mod, "safe_llm_call", llm):
            async with _TestSession() as session:
                uid = await _seed_user(session)
                result = await get_daily_insight(session, uid)

        assert result == {"insight": None}
        llm.assert_not_awaited()
        assert redis.setex_calls == []

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_without_llm(self, monkeypatch):
        _patch_stats(monkeypatch, _STATS_WITH_BOOK)
        redis = _FakeRedis(preseeded="cached insight")
        monkeypatch.setattr(insight_mod, "get_redis", lambda: redis)
        llm = AsyncMock()
        with patch.object(insight_mod, "safe_llm_call", llm):
            async with _TestSession() as session:
                uid = await _seed_user(session)
                result = await get_daily_insight(session, uid)

        assert result == {"insight": "cached insight"}
        llm.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_cache_miss_calls_llm_and_caches(self, monkeypatch):
        _patch_stats(monkeypatch, _STATS_WITH_BOOK)
        redis = _FakeRedis()
        monkeypatch.setattr(insight_mod, "get_redis", lambda: redis)
        llm = AsyncMock(return_value="  你已读完《傲慢与偏见》近半，节奏正好。  ")
        with patch.object(insight_mod, "safe_llm_call", llm):
            async with _TestSession() as session:
                uid = await _seed_user(session)
                result = await get_daily_insight(session, uid)

        assert result["insight"] == "你已读完《傲慢与偏见》近半，节奏正好。"
        llm.assert_awaited_once()
        kwargs = llm.await_args.kwargs
        assert kwargs["log_label"] == "Daily insight"
        assert kwargs["template"] is INSIGHT_SYSTEM
        # Signals (with sanitized title) reached the prompt.
        human = llm.await_args.args[0][1].content
        assert "傲慢与偏见" in human
        # Day-cache written with the long TTL.
        assert len(redis.setex_calls) == 1
        key, ttl, value = redis.setex_calls[0]
        assert ttl == 26 * 3600
        assert uid.hex in key or str(uid) in key
        assert value == result["insight"]

    @pytest.mark.asyncio
    async def test_llm_degrade_returns_null_without_caching(self, monkeypatch):
        _patch_stats(monkeypatch, _STATS_WITH_BOOK)
        redis = _FakeRedis()
        monkeypatch.setattr(insight_mod, "get_redis", lambda: redis)
        with patch.object(insight_mod, "safe_llm_call", AsyncMock(return_value="")):
            async with _TestSession() as session:
                uid = await _seed_user(session)
                result = await get_daily_insight(session, uid)

        assert result == {"insight": None}
        assert redis.setex_calls == [], "failures must not poison the day cache"

    @pytest.mark.asyncio
    async def test_redis_down_still_returns_llm_result(self, monkeypatch):
        _patch_stats(monkeypatch, _STATS_WITH_BOOK)

        class _BrokenRedis:
            async def get(self, key):
                raise ConnectionError("redis down")

            async def setex(self, key, ttl, value):
                raise ConnectionError("redis down")

        monkeypatch.setattr(insight_mod, "get_redis", lambda: _BrokenRedis())
        with patch.object(
            insight_mod, "safe_llm_call", AsyncMock(return_value="insight text")
        ):
            async with _TestSession() as session:
                uid = await _seed_user(session)
                result = await get_daily_insight(session, uid)

        assert result == {"insight": "insight text"}


# ---------------------------------------------------------------------------
# wiring
# ---------------------------------------------------------------------------


class TestInsightWiring:
    def test_templates_registered_with_variables(self):
        assert ALL_TEMPLATES["dashboard.insight.system"] is INSIGHT_SYSTEM
        assert ALL_TEMPLATES["dashboard.insight.human"] is INSIGHT_HUMAN
        assert INSIGHT_SYSTEM.version == 1
        assert INSIGHT_HUMAN.variables == ["signals"]
