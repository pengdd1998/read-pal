"""P1.4 tests: SSE producer-health (stall) detection.

Validates that ``_consume_queue`` emits a one-shot warning when only
keepalive frames have landed for ``_PRODUCER_STALL_WARN_SECONDS`` —
i.e. the LLM producer is hung but the 120s hard timeout hasn't fired
yet. The warning gives ops visibility into partial outages where users
see "spinner with no progress" for a minute.
"""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import MagicMock

import pytest

from app.services.agent_service import (
    _KEEPALIVE_FRAME,
    _PRODUCER_STALL_WARN_SECONDS,
    _SENTINEL,
    _consume_queue,
)


def _chunk(payload: str = 'hello') -> bytes:
    """A non-keepalive chunk that should reset the stall timer."""
    return f'data: {payload}\n\n'.encode('utf-8')


@pytest.mark.asyncio
async def test_real_chunk_resets_stall_timer(caplog):
    """Real chunks arriving on schedule produce no stall warning."""
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    tasks: list[asyncio.Task] = []
    uid, bid = 'u1', 'b1'

    async def produce():
        # Three real chunks, well under the stall threshold.
        await queue.put(_chunk('a'))
        await queue.put(_chunk('b'))
        await queue.put(_chunk('c'))
        await queue.put(_SENTINEL)

    with caplog.at_level(logging.WARNING, logger='read-pal.agent'):
        producer = asyncio.create_task(produce())
        tasks.append(producer)
        received = []
        async for item in _consume_queue(queue, tasks, uid, bid):
            received.append(item)

    assert item is _SENTINEL or received[-1] is not _SENTINEL
    assert not any(
        'agent_stream_producer_stalled' in rec.getMessage()
        for rec in caplog.records
    )


@pytest.mark.asyncio
async def test_stall_warns_once_when_only_keepalives(monkeypatch):
    """Only-keepalives for > threshold triggers exactly one warning."""
    # Speed up the test by lowering the threshold.
    monkeypatch.setattr(
        'app.services.agent_service._PRODUCER_STALL_WARN_SECONDS', 0.05,
    )

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    tasks: list[asyncio.Task] = []
    uid, bid = 'u1', 'b1'

    warnings_seen = []
    original_warning = logging.getLogger('read-pal.agent').warning

    def track_warning(msg, *args, **kwargs):
        if 'agent_stream_producer_stalled' in str(msg):
            warnings_seen.append(msg)
        return original_warning(msg, *args, **kwargs)

    monkeypatch.setattr(
        logging.getLogger('read-pal.agent'), 'warning', track_warning,
    )

    async def produce():
        # Two keepalives with a sleep > threshold between them.
        await queue.put(_KEEPALIVE_FRAME)
        await asyncio.sleep(0.1)
        await queue.put(_KEEPALIVE_FRAME)
        await asyncio.sleep(0.1)
        await queue.put(_SENTINEL)

    producer = asyncio.create_task(produce())
    tasks.append(producer)
    async for _ in _consume_queue(queue, tasks, uid, bid):
        pass

    # Exactly one warning despite multiple keepalives past threshold.
    assert len(warnings_seen) == 1, (
        f'expected 1 stall warning, got {len(warnings_seen)}'
    )


@pytest.mark.asyncio
async def test_stall_warning_resets_after_real_chunk(monkeypatch):
    """Stall warning fires again after recovery + re-stall."""
    monkeypatch.setattr(
        'app.services.agent_service._PRODUCER_STALL_WARN_SECONDS', 0.05,
    )

    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    tasks: list[asyncio.Task] = []

    warnings_seen = []
    original_warning = logging.getLogger('read-pal.agent').warning

    def track_warning(msg, *args, **kwargs):
        if 'agent_stream_producer_stalled' in str(msg):
            warnings_seen.append(msg)
        return original_warning(msg, *args, **kwargs)

    monkeypatch.setattr(
        logging.getLogger('read-pal.agent'), 'warning', track_warning,
    )

    async def produce():
        # stall → real chunk → stall again
        await queue.put(_KEEPALIVE_FRAME)
        await asyncio.sleep(0.1)
        await queue.put(_KEEPALIVE_FRAME)
        # Real chunk resets the timer
        await queue.put(_chunk())
        await asyncio.sleep(0.1)
        # New stall cycle
        await queue.put(_KEEPALIVE_FRAME)
        await asyncio.sleep(0.1)
        await queue.put(_KEEPALIVE_FRAME)
        await queue.put(_SENTINEL)

    producer = asyncio.create_task(produce())
    tasks.append(producer)
    async for _ in _consume_queue(queue, tasks, 'u', 'b'):
        pass

    assert len(warnings_seen) == 2, (
        f'expected 2 stall warnings (one per stall cycle), got {len(warnings_seen)}'
    )


@pytest.mark.asyncio
async def test_threshold_default_is_60s():
    """Defense against accidentally tuning the threshold down."""
    assert _PRODUCER_STALL_WARN_SECONDS == 60
