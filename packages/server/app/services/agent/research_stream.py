"""SSE streaming variant of the Research agent (matrix J2).

Phase-streamed, not token-streamed: retrieval and synthesis are both
opaque waits (RAG embedding + schema-validated ``safe_llm_invoke``), so
the client gets progressive frames instead of tokens —

    request_id → searching → sources (citations as soon as RAG lands)
    → synthesizing → brief → [DONE]

— with ``: keepalive`` comment frames every 15s so proxies don't drop
the connection during the ~90s synthesis. Cancellation reuses the shared
``stream_registry``: ``POST /chat/cancel`` with the streamed
``request_id`` works unchanged, including cross-worker via Redis.

The bytes-level wrapper mirrors ``agent.gateway.sse_bytes_stream``:
registry registration, the C1 concurrency bulkhead, and the P0.6
idempotency completion marker in ``finally``.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import release_db
from app.services.agent.research import (
    _books_searched,
    _empty_brief_for,
    _is_research_fallback,
    _source_metadata,
    _synthesize_brief,
)
from app.services.agent.stream_registry import (
    register_stream,
    register_stream_cross_worker,
    release_stream,
    release_stream_cross_worker,
)
from app.services.llm.concurrency import acquire_stream_slot, release_stream_slot
from app.services.rag.cross_book import cross_book_search
from app.utils.sanitizer import sanitize_user_input

logger = structlog.get_logger("read-pal.research")

# Matches the gateway keepalive cadence (P0.3): proxies time out idle
# SSE connections well before the ~90s synthesis finishes.
_KEEPALIVE_SECONDS = 15.0


def _frame(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def _with_keepalive(
    events: AsyncGenerator[str, None],
) -> AsyncGenerator[str, None]:
    """Yield keepalive comments whenever the wrapped generator stalls.

    ``asyncio.wait`` with a timeout — NOT ``wait_for`` — so the pending
    ``__anext__`` survives each keepalive: cancelling it mid-await would
    abort the suspended RAG/LLM call and kill the generator. Research
    emits ~6 frames total, so this race is enough; no queue+task pump
    needed.
    """
    iterator = events.__aiter__()
    pending: asyncio.Task[str] | None = None
    try:
        while True:
            if pending is None:
                pending = asyncio.ensure_future(iterator.__anext__())
            done, _ = await asyncio.wait({pending}, timeout=_KEEPALIVE_SECONDS)
            if not done:
                yield ": keepalive\n\n"
                continue
            try:
                item = pending.result()
            except StopAsyncIteration:
                return
            pending = None
            yield item
    finally:
        if pending is not None:
            # Client disconnect: propagate cancellation into the suspended
            # RAG/LLM await so no orphaned request outlives the response.
            pending.cancel()
        try:
            await events.aclose()
        except Exception:  # noqa: BLE001 — disconnect races; nothing left to clean
            logger.debug("research.stream.events_close_failed")


async def research_stream_events(
    db: AsyncSession,
    user_id: UUID,
    question: str,
    book_ids: list[UUID] | None,
    request_id: str,
    cancelled: asyncio.Event,
) -> AsyncGenerator[str, None]:
    """Emit the research SSE frames (str chunks, no transport concerns)."""
    yield _frame({"request_id": request_id})

    safe_question = sanitize_user_input(
        question,
        max_length=2000,
        context="research_question",
    )
    logger.info(
        "research.stream.started",
        user_id=str(user_id),
        request_id=request_id,
        scoped=bool(book_ids),
    )

    yield _frame({"phase": "searching"})
    chunks = await cross_book_search(db, user_id, safe_question, book_ids=book_ids)

    if cancelled.is_set():
        logger.info("research.stream.cancelled_after_search", request_id=request_id)
        yield _frame({"cancelled": True})
        yield "data: [DONE]\n\n"
        return

    if not chunks:
        logger.info("research.stream.no_sources", request_id=request_id)
        yield _frame({"brief": await _empty_brief_for(db, user_id)})
        yield "data: [DONE]\n\n"
        return

    sources = _source_metadata(chunks)
    yield _frame({
        "phase": "sources",
        "sources": sources,
        "books_searched": _books_searched(chunks),
    })

    if cancelled.is_set():
        yield _frame({"cancelled": True})
        yield "data: [DONE]\n\n"
        return

    yield _frame({"phase": "synthesizing"})
    # The synthesis call holds no DB state — return the pooled connection
    # for the ~90s the LLM works, same rationale as companion streaming.
    # Best-effort: on client disconnect the dependency teardown closes the
    # session concurrently with this read-txn commit — the race surfaces as
    # asyncpg InterfaceError (unhandled 500). The commit only persists
    # reads; losing it to a disconnect is harmless.
    try:
        await release_db(db)
    except Exception:  # noqa: BLE001 — teardown race, nothing to recover
        logger.debug(
            "research.stream.release_db_failed",
            request_id=request_id,
        )
    data = await _synthesize_brief(user_id, safe_question, chunks)

    if cancelled.is_set():
        # Client opted out mid-synthesis: nothing to render, skip the brief.
        logger.info("research.stream.cancelled_after_synthesis", request_id=request_id)
        yield _frame({"cancelled": True})
        yield "data: [DONE]\n\n"
        return

    if _is_research_fallback(data):
        data["error"] = "AI analysis unavailable - showing partial results"

    logger.info(
        "research.stream.completed",
        request_id=request_id,
        findings_count=len(data.get("findings", [])),
        sources_count=len(sources),
    )
    yield _frame({"brief": {**data, "sources": sources, "books_searched": _books_searched(chunks)}})
    yield "data: [DONE]\n\n"


async def research_sse_stream(
    db: AsyncSession,
    user_id: UUID,
    question: str,
    book_ids: list[UUID] | None = None,
    request_id: str | None = None,
    request: Any = None,
) -> AsyncGenerator[bytes, None]:
    """Bytes-level SSE generator: registry + bulkhead + P0.6 completion marker.

    Raises ``HTTPException(503 STREAM_CAPACITY)`` before the first frame
    when the global stream bulkhead is saturated (C1) — same contract as
    the chat stream endpoint.
    """
    actual_request_id = request_id or uuid.uuid4().hex[:12]
    cancelled = register_stream(actual_request_id)
    # Cross-worker: let /chat/cancel on any worker find us via Redis
    # pub/sub. Best-effort; local cancel still works if Redis is down.
    await register_stream_cross_worker(actual_request_id)

    if not await acquire_stream_slot(actual_request_id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "STREAM_CAPACITY",
                "message": "Too many concurrent streams. Please retry shortly.",
            },
            headers={"Retry-After": "5"},
        )

    try:
        async for chunk in _with_keepalive(
            research_stream_events(db, user_id, question, book_ids, actual_request_id, cancelled)
        ):
            yield chunk.encode("utf-8")
    except Exception:  # noqa: BLE001 — after a client disconnect nothing can be yielded anyway
        logger.warning(
            "research.stream.transport_error",
            request_id=actual_request_id,
            exc_info=True,
        )
    finally:
        release_stream(actual_request_id)
        await release_stream_cross_worker(actual_request_id)
        await release_stream_slot()
        # P0.6: mark the idempotency key completed so a replay returns
        # ALREADY_COMPLETED instead of RATE_LIMIT_EXCEEDED.
        if request is not None:
            try:
                from app.middleware.idempotency import mark_stream_completed
                await mark_stream_completed(request)
            except Exception:  # noqa: BLE001 — completion marker is best-effort
                logger.debug(
                    "research.stream_completion_mark_failed request_id=%s",
                    actual_request_id,
                )
