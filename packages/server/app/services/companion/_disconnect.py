"""Client-disconnect probe helper — kept in its own module to avoid the
``streaming`` ↔ ``stream_fallback`` import cycle.

Both ``streaming._stream_with_llm`` and ``stream_fallback._stream_from_fallback_llm``
need this exact same throttled probe; placing it here lets each import
the helper without creating a circular top-level import.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from app.services.companion.constants import DISCONNECT_CHECK_EVERY_N_CHUNKS

logger = structlog.get_logger('read-pal.companion')


async def maybe_mark_disconnect(
    request: Any,
    cancelled: asyncio.Event | None,
    request_id: str,
    chunk_counter: int,
    *,
    model: str = '',
    provider: str = '',
) -> bool:
    """Throttled client-disconnect probe.

    Returns True if the disconnect check ran AND detected a disconnect
    (signalling cancellation to the upstream cascade). Returns False
    otherwise — including when the throttle suppresses the probe this
    iteration, which is the common case.

    When disconnect is detected, ``cancelled`` is set so the upstream
    cascade (fallback skip, persist skip, billing refund) treats this the
    same as a /chat/cancel. Probes are throttled to every Nth chunk so
    the syscall cost stays off the hot path.
    """
    if request is None or chunk_counter % DISCONNECT_CHECK_EVERY_N_CHUNKS != 0:
        return False
    try:
        if await request.is_disconnected():
            if cancelled is not None:
                cancelled.set()
            logger.info(
                'companion.stream.client_disconnected',
                request_id=request_id,
                model=model,
                provider=provider,
            )
            return True
    except Exception:  # noqa: BLE001 — disconnect probe must never break the stream
        return False
    return False
