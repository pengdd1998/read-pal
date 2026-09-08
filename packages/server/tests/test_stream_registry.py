"""Tests for the in-flight stream registry (engineering-upgrade leftover #7).

``app/services/agent/stream_registry.py`` had zero test coverage despite
backing the P0.3 cross-worker cancel contract. These tests pin the local
registry lifecycle and every branch of ``cancel_stream_cross_worker``'s
reason taxonomy (local / cross_worker / unknown_worker / not_found /
redis_error) plus the pub/sub fan-out listener.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agent import stream_registry
from app.services.agent.stream_registry import (
    _INFLIGHT_STREAMS,
    _stream_owner_key,
    _worker_alive_key,
    cancel_stream,
    cancel_stream_cross_worker,
    new_request_id,
    register_stream,
    register_stream_cross_worker,
    release_stream,
    release_stream_cross_worker,
)


@pytest.fixture(autouse=True)
def _clean_registry():
    _INFLIGHT_STREAMS.clear()
    yield
    _INFLIGHT_STREAMS.clear()


def _mock_redis(**behaviors: Any) -> MagicMock:
    """Redis client mock with per-test behaviors for cross-worker paths."""
    client = MagicMock()
    client.get = AsyncMock(return_value=behaviors.get('owner'))
    client.exists = AsyncMock(return_value=behaviors.get('alive', 0))
    client.delete = AsyncMock(return_value=1)
    client.set = AsyncMock(return_value=True)
    return client


class TestLocalRegistry:
    def test_register_returns_event_and_tracks_stream(self):
        event = register_stream('req-1')
        assert isinstance(event, asyncio.Event)
        assert not event.is_set()
        assert 'req-1' in _INFLIGHT_STREAMS

    def test_register_reused_id_replaces_and_warns(self, caplog):
        first = register_stream('req-1')
        with caplog.at_level('WARNING', logger='read-pal.agent'):
            second = register_stream('req-1')
        assert second is not first
        assert any('request_id_reused' in r.message for r in caplog.records)

    def test_release_is_idempotent(self):
        register_stream('req-1')
        release_stream('req-1')
        release_stream('req-1')  # must not raise
        assert 'req-1' not in _INFLIGHT_STREAMS

    def test_cancel_local_sets_event(self):
        event = register_stream('req-1')
        assert cancel_stream('req-1') is True
        assert event.is_set()

    def test_cancel_unknown_returns_false(self):
        assert cancel_stream('nope') is False

    def test_new_request_id_shape(self):
        rid = new_request_id()
        assert len(rid) == 12
        assert new_request_id() != rid


class TestCrossWorkerCancel:
    async def test_local_fast_path(self):
        register_stream('req-1')
        result = await cancel_stream_cross_worker('req-1')
        assert result == {'cancelled': True, 'reason': 'local'}

    async def test_not_found_when_no_owner_key(self):
        with patch(
            'app.core.redis.get_redis',
            return_value=_mock_redis(owner=None),
        ):
            result = await cancel_stream_cross_worker('req-404')
        assert result == {'cancelled': False, 'reason': 'not_found'}

    async def test_cross_worker_when_owner_alive_and_delivered(self):
        owner_id = 'worker-b'
        with patch(
            'app.core.redis.get_redis',
            return_value=_mock_redis(owner=owner_id, alive=1),
        ), patch(
            'app.core.redis.publish', new_callable=AsyncMock, return_value=1,
        ) as mock_publish:
            result = await cancel_stream_cross_worker('req-1')
        assert result == {'cancelled': True, 'reason': 'cross_worker'}
        channel = mock_publish.call_args.args[0]
        assert channel == f'cancel_stream:{owner_id}'
        assert mock_publish.call_args.args[1] == {'request_id': 'req-1'}

    async def test_unknown_worker_when_owner_heartbeat_expired(self):
        client = _mock_redis(owner='worker-dead', alive=0)
        with patch('app.core.redis.get_redis', return_value=client):
            result = await cancel_stream_cross_worker('req-1')
        assert result == {'cancelled': False, 'reason': 'unknown_worker'}
        # Stale owner key must be cleaned so later cancels short-circuit.
        client.delete.assert_awaited_once_with(_stream_owner_key('req-1'))

    async def test_unknown_worker_when_publish_reaches_no_subscriber(self):
        with patch(
            'app.core.redis.get_redis',
            return_value=_mock_redis(owner='worker-b', alive=1),
        ), patch(
            'app.core.redis.publish', new_callable=AsyncMock, return_value=0,
        ):
            result = await cancel_stream_cross_worker('req-1')
        assert result == {'cancelled': False, 'reason': 'unknown_worker'}

    async def test_redis_error_degrades_not_raises(self):
        broken = MagicMock()
        broken.get = AsyncMock(side_effect=ConnectionError('redis down'))
        with patch('app.core.redis.get_redis', return_value=broken):
            result = await cancel_stream_cross_worker('req-1')
        assert result == {'cancelled': False, 'reason': 'redis_error'}


class TestCrossWorkerOwnership:
    async def test_register_sets_owner_key_with_stream_ttl(self):
        client = _mock_redis()
        with patch('app.core.redis.get_redis', return_value=client):
            await register_stream_cross_worker('req-1')
        client.set.assert_awaited_once_with(
            _stream_owner_key('req-1'), stream_registry.WORKER_ID, ex=300,
        )

    async def test_release_deletes_owner_key(self):
        client = _mock_redis()
        with patch('app.core.redis.get_redis', return_value=client):
            await release_stream_cross_worker('req-1')
        client.delete.assert_awaited_once_with(_stream_owner_key('req-1'))

    async def test_registration_failure_is_silent(self):
        broken = MagicMock()
        broken.set = AsyncMock(side_effect=ConnectionError('redis down'))
        with patch('app.core.redis.get_redis', return_value=broken):
            await register_stream_cross_worker('req-1')  # must not raise


class TestCancelListenerFanout:
    async def test_listener_sets_local_event_on_published_request_id(self):
        register_stream('req-99')
        event = _INFLIGHT_STREAMS['req-99']

        async def fake_subscribe(channel: str):
            assert channel == f'cancel_stream:{stream_registry.WORKER_ID}'
            yield {'request_id': 'req-99'}
            yield 'not-a-valid-payload-but-must-not-crash'

        with patch('app.core.redis.subscribe', side_effect=fake_subscribe):
            await stream_registry._start_cancel_listener()

        assert event.is_set()

    async def test_heartbeat_refresh_sets_alive_key(self):
        client = _mock_redis()
        with patch('app.core.redis.get_redis', return_value=client):
            await stream_registry._refresh_heartbeat()
        client.set.assert_awaited_once_with(
            _worker_alive_key(), '1', ex=stream_registry._WORKER_HEARTBEAT_TTL,
        )

    async def test_heartbeat_failure_is_silent(self):
        broken = MagicMock()
        broken.set = AsyncMock(side_effect=ConnectionError('redis down'))
        with patch('app.core.redis.get_redis', return_value=broken):
            await stream_registry._refresh_heartbeat()  # must not raise
