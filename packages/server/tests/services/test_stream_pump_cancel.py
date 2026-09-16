"""SSE cancel-propagation tests for the companion stream pump (leftover #7).

Pins the P0.3-adjacent contract at the chunk-loop level: once the
cancellation Event is set, the pump must stop consuming the vendor stream
promptly (instead of draining it until the 120s timeout), and log the
cancel-inside-astream marker used during incident triage.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch

import pytest

from app.services.companion.stream_pump import _stream_with_llm

USER_ID = '00000000-0000-0000-0000-000000000001'
BOOK_ID = '00000000-0000-0000-0000-000000000002'


class _Chunk:
    def __init__(self, content: str) -> None:
        self.content = content


class _VendorStream:
    """Fake llm.astream source that counts how many chunks were pulled."""

    def __init__(self, tokens: list[str], cancelled_after: int, event: asyncio.Event) -> None:
        self._tokens = tokens
        self._cancelled_after = cancelled_after
        self._event = event
        self.pulled = 0

    async def astream(self, messages: Any) -> Any:
        for token in self._tokens:
            self.pulled += 1
            if self.pulled > self._cancelled_after:
                self._event.set()
            yield _Chunk(token)
            # Give the pump a beat so the cancel check sees the event.
            await asyncio.sleep(0)


@pytest.fixture(autouse=True)
def _no_stream_persistence():
    # persist_stream_log writes via llm_log_service; the cancel contract under
    # test here is about consumption, not persistence.
    with patch('app.services.companion.stream_pump.persist_stream_log'):
        yield


async def _run_pump(vendor: _VendorStream, cancelled: asyncio.Event) -> list[str]:
    collected: list[str] = []
    emitted: list[str] = []
    pump = _stream_with_llm(
        llm=vendor,
        messages=[],
        collected_parts=collected,
        request_id='req-cancel-1',
        start_time=0.0,
        model_used='glm-4.7-flash',
        user_id=USER_ID,
        book_id=BOOK_ID,
        cancelled=cancelled,
        request=None,          # skip client-disconnect probing
        seq_state=None,        # un-tagged chunks: no Redis replay buffer
    )
    async for out in pump:
        emitted.append(out)
    return collected


class TestCancelPropagation:
    async def test_cancel_stops_consuming_vendor_stream(self, capsys):
        cancelled = asyncio.Event()
        vendor = _VendorStream(
            tokens=[f'tok{i} ' for i in range(50)],
            cancelled_after=3,
            event=cancelled,
        )

        collected = await _run_pump(vendor, cancelled)

        # The vendor must NOT have been drained — cancel broke the loop early.
        assert vendor.pulled < 50
        assert len(collected) < 50
        # Cancel marker logged for triage (structlog prints to stdout in tests).
        assert 'cancelled_inside_astream' in capsys.readouterr().out

    async def test_no_cancel_consumes_everything(self):
        cancelled = asyncio.Event()
        vendor = _VendorStream(
            tokens=[f'tok{i} ' for i in range(10)],
            cancelled_after=10_000,  # never fires
            event=cancelled,
        )
        collected = await _run_pump(vendor, cancelled)
        assert vendor.pulled == 10
        assert len(collected) == 10
