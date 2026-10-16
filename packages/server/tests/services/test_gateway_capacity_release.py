"""GB-1 — gateway stream capacity rejection must roll back registry entries.

Risk-review 10-13 located the same defect class the research stream had
(fixed 09-21): ``sse_bytes_stream`` registers the stream (local dict +
cross-worker Redis owner key) BEFORE the bulkhead check, and the 503 raise
sat outside the try/finally that releases — a sweeper-less leak per
rejection. These tests pin the rollback contract on the gateway path.
"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock

import pytest

from app.services.agent import gateway


class TestGatewayCapacityRejectionRegistryHygiene:
    @pytest.mark.asyncio
    async def test_rejected_stream_releases_registry(self, monkeypatch):
        from fastapi import HTTPException

        seen = []

        def fake_register(rid):
            seen.append(('reg', rid))
            return asyncio.Event()

        async def fake_register_cross(rid):
            seen.append(('regx', rid))

        released = []
        released_cross = []

        monkeypatch.setattr(gateway, 'register_stream', fake_register)
        monkeypatch.setattr(gateway, 'register_stream_cross_worker', fake_register_cross)
        # acquire_stream_slot is imported inside the function body from
        # app.services.llm.concurrency — patch at the source module.
        monkeypatch.setattr(
            'app.services.llm.concurrency.acquire_stream_slot',
            AsyncMock(return_value=False),
        )
        monkeypatch.setattr(
            gateway, 'release_stream',
            lambda rid: released.append(('rel', rid)),
        )

        async def fake_release_cross(rid):
            released_cross.append(rid)

        monkeypatch.setattr(gateway, 'release_stream_cross_worker', fake_release_cross)

        with pytest.raises(HTTPException) as exc_info:
            async for _chunk in gateway.sse_bytes_stream(
                None, uuid.uuid4(), uuid.uuid4(), '你好', request_id='cap-gw-1',
            ):
                pass

        assert exc_info.value.status_code == 503
        assert exc_info.value.detail['code'] == 'STREAM_CAPACITY'
        assert ('reg', 'cap-gw-1') in seen and ('regx', 'cap-gw-1') in seen
        assert ('rel', 'cap-gw-1') in released, 'local registry entry must roll back'
        assert released_cross == ['cap-gw-1'], 'cross-worker owner key must roll back'
