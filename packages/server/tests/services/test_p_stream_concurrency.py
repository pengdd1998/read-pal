"""C1 — Redis-backed global streaming concurrency bulkhead.

Closes the gap where the per-worker ``asyncio.Semaphore`` only bounded
concurrency *within* a single uvicorn process. With N workers, the true
concurrent-stream ceiling was N × cap — a viral traffic spike distributing
across workers could still exhaust the vendor connection pool.

The Redis-backed counter in ``concurrency.py`` is incremented on every
acquire and decremented on every release, so the cap spans all workers
on the host.

These tests pin the contract:
- INCR / DECR round-trips cleanly
- TTL is established on first acquire (worker crash safety)
- Cap is enforced with strict greater-than (at-cap rejects)
- DECR-clamp guards against double-release
- Redis-down fail-open (acquire returns True) so flaky Redis never 503s
- Redis-down release never raises
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm import concurrency


# ---------------------------------------------------------------------------
# Helper: fake Redis client that tracks INCR/DECR/EXPIRE state
# ---------------------------------------------------------------------------


class _FakeRedis:
    """Minimal fake Redis — supports INCR / DECR / EXPIRE / SET."""

    def __init__(self) -> None:
        self.store: dict[str, int] = {}
        self.ttl: dict[str, int] = {}
        self.incr_calls = 0
        self.decr_calls = 0
        self.expire_calls = 0

    async def incr(self, key: str) -> int:
        self.incr_calls += 1
        self.store[key] = self.store.get(key, 0) + 1
        return self.store[key]

    async def decr(self, key: str) -> int:
        self.decr_calls += 1
        self.store[key] = self.store.get(key, 0) - 1
        return self.store[key]

    async def expire(self, key: str, ttl: int) -> bool:
        self.expire_calls += 1
        self.ttl[key] = ttl
        return True

    async def set(self, key: str, value: int) -> bool:
        self.store[key] = int(value)
        return True


# ---------------------------------------------------------------------------
# Acquire increments the global counter
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_increments_redis_counter():
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake), \
         patch.object(concurrency, '_get_cap', return_value=20):
        ok1 = await concurrency.acquire_stream_slot('req-1')
        ok2 = await concurrency.acquire_stream_slot('req-2')

    assert ok1 is True
    assert ok2 is True
    assert fake.store[concurrency._STREAM_SLOT_KEY] == 2
    assert fake.incr_calls == 2


@pytest.mark.asyncio
async def test_acquire_sets_ttl_on_first_acquire():
    """TTL safety net is established on the first acquire so an orphaned
    slot (worker crash before release) auto-expires."""
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake), \
         patch.object(concurrency, '_get_cap', return_value=20):
        await concurrency.acquire_stream_slot('req-1')
        # Second acquire should NOT re-set TTL (counter already > 1).
        await concurrency.acquire_stream_slot('req-2')

    assert fake.expire_calls == 1, 'EXPIRE must fire only when INCR returns 1'
    assert fake.ttl[concurrency._STREAM_SLOT_KEY] == concurrency._SLOT_TTL_SECONDS


# ---------------------------------------------------------------------------
# Cap enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_rejects_when_at_capacity():
    fake = _FakeRedis()
    # Pre-populate the counter at cap.
    fake.store[concurrency._STREAM_SLOT_KEY] = 20
    with patch('app.core.redis.get_redis', return_value=fake), \
         patch.object(concurrency, '_get_cap', return_value=20):
        ok = await concurrency.acquire_stream_slot('req-over')

    assert ok is False
    # Counter must NOT have grown — over-cap acquire rolls back via DECR.
    # INCR (to 21) then DECR (back to 20).
    assert fake.store[concurrency._STREAM_SLOT_KEY] == 20
    assert fake.incr_calls == 1
    assert fake.decr_calls == 1


@pytest.mark.asyncio
async def test_acquire_allows_under_cap():
    fake = _FakeRedis()
    fake.store[concurrency._STREAM_SLOT_KEY] = 19
    with patch('app.core.redis.get_redis', return_value=fake), \
         patch.object(concurrency, '_get_cap', return_value=20):
        ok = await concurrency.acquire_stream_slot('req-ok')

    assert ok is True
    assert fake.store[concurrency._STREAM_SLOT_KEY] == 20


# ---------------------------------------------------------------------------
# Release
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_release_decrements_counter():
    fake = _FakeRedis()
    fake.store[concurrency._STREAM_SLOT_KEY] = 5
    with patch('app.core.redis.get_redis', return_value=fake):
        await concurrency.release_stream_slot()

    assert fake.store[concurrency._STREAM_SLOT_KEY] == 4
    assert fake.decr_calls == 1


@pytest.mark.asyncio
async def test_release_clamps_negative_counter_to_zero():
    """Double-release (or release-without-acquire) shouldn't leave a
    negative counter — that would falsely advertise headroom. Clamp
    resets to 0 on detect."""
    fake = _FakeRedis()
    fake.store[concurrency._STREAM_SLOT_KEY] = 0
    with patch('app.core.redis.get_redis', return_value=fake):
        await concurrency.release_stream_slot()

    # DECR made it -1, then the clamp SET 0.
    assert fake.store[concurrency._STREAM_SLOT_KEY] == 0
    assert fake.decr_calls == 1


# ---------------------------------------------------------------------------
# Failure modes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquire_fails_open_on_redis_error():
    """Redis-down on acquire must NOT block traffic. We'd rather briefly
    over-subscribe than 503 every stream because the coordination layer
    is flaky."""
    broken_redis = MagicMock()
    broken_redis.incr = AsyncMock(side_effect=ConnectionError('redis down'))
    broken_redis.decr = AsyncMock(side_effect=ConnectionError('redis down'))

    with patch('app.core.redis.get_redis', return_value=broken_redis):
        ok = await concurrency.acquire_stream_slot('req-x')

    assert ok is True, 'fail-open must return True on Redis error'


@pytest.mark.asyncio
async def test_release_never_raises_on_redis_error():
    """Release runs in a finally block — it must never propagate."""
    broken_redis = MagicMock()
    broken_redis.decr = AsyncMock(side_effect=ConnectionError('redis down'))

    with patch('app.core.redis.get_redis', return_value=broken_redis):
        # Should complete without raising.
        await concurrency.release_stream_slot()


# ---------------------------------------------------------------------------
# Concurrent acquires respect the global cap
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_acquires_respect_global_cap():
    """Spawn 30 coroutines against a cap of 20 — exactly 20 should succeed
    and 10 should be rejected."""
    fake = _FakeRedis()
    with patch('app.core.redis.get_redis', return_value=fake), \
         patch.object(concurrency, '_get_cap', return_value=20):
        results = await asyncio.gather(*[
            concurrency.acquire_stream_slot(f'req-{i}')
            for i in range(30)
        ])

    successes = sum(1 for r in results if r is True)
    failures = sum(1 for r in results if r is False)
    assert successes == 20, f'expected 20 successes, got {successes}'
    assert failures == 10, f'expected 10 failures, got {failures}'
    # Final counter state must match the number of successful acquires.
    assert fake.store[concurrency._STREAM_SLOT_KEY] == 20


# ---------------------------------------------------------------------------
# get_cap respects config
# ---------------------------------------------------------------------------


def test_get_cap_reads_from_settings():
    """_get_cap should return Settings.llm_max_concurrent_streams."""
    from app.config import get_settings
    expected = get_settings().llm_max_concurrent_streams
    assert concurrency._get_cap() == expected


def test_get_cap_defaults_on_import_error():
    """If settings can't be loaded (test fixture edge case), return 20
    rather than raising."""
    with patch('app.config.get_settings', side_effect=RuntimeError('boom')):
        assert concurrency._get_cap() == 20
