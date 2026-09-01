"""SSE streaming for companion chat — request-level orchestration.

The pipeline decomposes into:
- ``stream_pump`` — vendor token pump + id-tagged SSE emission (D1/D2)
- ``stream_provider`` — primary provider + circuit-breaker fallback (B3)
- ``stream_persist`` — retry-wrapped persistence + budget settlement (P0.2)
- this module — provider resolution, budget pre-charge, the request state
  machine tying the three together, and the public ``stream_chat`` entry.

The helpers below are re-exported so historical import paths
(``streaming._emit_with_seq`` etc.) keep resolving.
"""

import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import release_db
from app.services.companion.context import (
    _build_messages,
    _prepare_context,
)
from app.services.companion.stream_cache import sse_chunk, try_emit_cached
from app.services.companion.stream_persist import _persist_with_retry, _settle_token_budget
from app.services.companion.stream_provider import (  # noqa: F401 — re-exported API
    _STREAM_MAX_OUTPUT_TOKENS,
    _get_stream_provider,
    _handle_stream_failure,
    _resolve_fallback_metadata,
    _stream_from_provider,
)
from app.services.companion.stream_pump import (  # noqa: F401 — re-exported API
    _STREAM_TIMEOUT_SECONDS,
    _emit_metadata_with_seq,
    _emit_with_seq,
    _stream_with_llm,
)
from app.services.llm.registry import get_registry
from app.utils.i18n import DEFAULT_LANGUAGE, t

logger = structlog.get_logger('read-pal.companion')

# Reserved output tokens for the daily token-budget pre-charge. Streaming
# calls settle with actual emitted tokens afterwards, so this is a
# conservative estimate based on observed companion response lengths.
# Must stay <= _STREAM_MAX_OUTPUT_TOKENS (stream_provider.py).
_STREAM_RESERVED_OUTPUT_TOKENS = 800


async def _stream_via_provider(  # noqa: PLR0915 — single orchestration flow
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[Any],
    lang: str,
    request_id: str | None = None,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
) -> AsyncGenerator[str, None]:
    """Resolve provider, stream response, and persist result.

    Emits ``data: {"error": "persist_failed"}`` if DB persistence fails after
    one retry so the client can warn the user. ``[DONE]`` is yielded AFTER
    persistence so the client doesn't terminate early and miss the signal.

    P0.2: pre-charges the daily token budget ONCE per logical request (not
    per attempt). ``collected_parts`` accumulates emitted output across the
    primary + fallback chain, so we can settle with actual emitted token
    count at the end — billing the user for exactly the tokens they
    received, even if the primary failed mid-stream and fallback succeeded.
    """
    from app.config import get_settings
    from app.middleware.daily_llm_budget import (
        _get_budget, estimate_input_tokens,
    )

    collected_parts: list[str] = []
    actual_request_id = request_id or uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    registry = get_registry()

    # Always echo the request id as the first frame so the client can issue
    # a /chat/cancel against it later in the same connection.
    yield f'data: {json.dumps({"request_id": actual_request_id})}\n\n'

    if cancelled is not None and cancelled.is_set():
        logger.info(
            'companion.stream.cancelled_before_start',
            request_id=actual_request_id,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        yield 'data: [DONE]\n\n'
        return

    provider_info = _get_stream_provider(registry, actual_request_id)
    if provider_info is None:
        yield sse_chunk(t('companion.fallback_error', lang))
        yield 'data: [DONE]\n\n'
        # No provider available (e.g. circuit breaker open from sustained
        # rate limiting). Still persist the user's message so it isn't lost —
        # persist_stream_result saves the user side even with empty content.
        await _persist_with_retry(
            db, user_id, book_id, message, messages,
            [], actual_request_id, lang=lang,
        )
        return

    state, provider_name, model_used = provider_info

    # Pre-charge the daily token budget ONCE for the logical request.
    # The pre-charge is held across primary + fallback attempts; settlement
    # at the end uses actual emitted tokens so we don't double-bill when
    # primary emits partial output before failing and fallback succeeds.
    settings = get_settings()
    token_limit = settings.llm_daily_token_budget
    pre_charge = 0
    user_id_str = str(user_id)
    if token_limit > 0:
        reserved_output = _STREAM_RESERVED_OUTPUT_TOKENS
        pre_charge = estimate_input_tokens(messages) + reserved_output
        budget = _get_budget()
        allowed, _, _ = await budget.check_and_charge_tokens(
            user_id_str, pre_charge, token_limit,
        )
        if not allowed:
            logger.warning(
                'companion.stream.token_budget_blocked',
                request_id=actual_request_id,
                user_id=user_id_str,
                pre_charge=pre_charge, limit=token_limit,
            )
            yield sse_chunk(t('errors.daily_llm_budget_exceeded', lang))
            yield 'data: [DONE]\n\n'
            return

    # LLM stream may run for minutes (retries + provider failover). Release
    # the pooled connection first — persist re-checkouts transparently.
    await release_db(db)

    stream_failed = False
    billing_state: dict = {'partial_chars': 0}
    # D1: mutable counter for SSE id-tagged chunks. Shared across primary
    # + fallback so a reconnect (Last-Event-ID) can resume at the right
    # offset regardless of which provider emitted the chunk.
    seq_state: list[int] = [0]
    try:
        async for chunk in _stream_from_provider(
            state, provider_name, model_used, messages,
            collected_parts, actual_request_id, start_time,
            user_id, book_id, lang, cancelled=cancelled,
            billing_state=billing_state, request=request, seq_state=seq_state,
            registry=registry,
        ):
            if cancelled is not None and cancelled.is_set():
                logger.info(
                    'companion.stream.cancelled_mid_stream',
                    request_id=actual_request_id,
                    user_id=str(user_id),
                    book_id=str(book_id),
                )
                break
            yield chunk
    except (Exception, asyncio.CancelledError):  # noqa: BLE001 — CancelledError on disconnect
        stream_failed = True
        raise
    finally:
        # P0.2: settle the pre-charge based on what the user actually saw.
        # collected_parts accumulates across primary + fallback, so:
        #   - Has content → vendor billed for input + emitted output. Settle
        #     with estimate so user pays exactly once for the logical request.
        #   - Empty (all attempts failed before any emit) → refund in full.
        await _settle_token_budget(
            user_id_str, actual_request_id, pre_charge,
            token_limit, messages, collected_parts, billing_state,
        )

        # Skip persistence on cancellation or stream-level error. For
        # cancellation the user already opted out of the response; for a
        # stream error the fallback inside _stream_from_provider already
        # ran and we have no reliable partial to save.
        is_cancelled = cancelled is not None and cancelled.is_set()
        if stream_failed or is_cancelled:
            if is_cancelled:
                logger.info(
                    'companion.stream.persist_skipped_cancelled',
                    request_id=actual_request_id,
                )
            return

        assistant_db_id = await _persist_with_retry(
            db, user_id, book_id, message, messages,
            collected_parts, actual_request_id, lang=lang,
        )
        if assistant_db_id is None:
            # Tell the client the streamed response couldn't be saved.
            # Client should keep visible text (user already read it) but
            # warn that reload will lose the message.
            yield f'data: {json.dumps({"error": "persist_failed"})}\n\n'
        else:
            # Hand the client the assistant message's real DB id — feedback
            # ratings FK against chat_messages.id, and the client's local
            # id is a random UUID that would violate it.
            await _emit_with_seq(
                json.dumps({"type": "message_id", "id": str(assistant_db_id)}),
                actual_request_id, seq_state,
            )

    if not stream_failed:
        yield 'data: [DONE]\n\n'


async def stream_chat(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    context: dict | None = None,
    companion_mode: str = 'casual',
    persona: str | None = None,
    genre: str | None = None,
    lang: str = DEFAULT_LANGUAGE,
    request_id: str | None = None,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
) -> AsyncGenerator[str, None]:
    """Stream companion chat as SSE chunks with per-provider circuit breaker."""
    _, history, system_text, budget = await _prepare_context(
        db, user_id, book_id, message, context, companion_mode,
        persona=persona, genre=genre, lang=lang,
    )
    messages = _build_messages(system_text, history, message, budget)

    if budget.truncations:
        logger.warning(
            'companion.stream.budget_truncated',
            truncations=', '.join(budget.truncations),
            user_id=str(user_id),
            book_id=str(book_id),
        )

    # Try cached response first (honor cancellation even on the cache-hit path,
    # otherwise a cached reply ignores /chat/cancel and still persists).
    if cancelled is not None and cancelled.is_set():
        return
    cache_used = False
    async for chunk in try_emit_cached(
        db, user_id, book_id, message, messages, lang=lang,
    ):
        cache_used = True
        yield chunk
    if cache_used:
        return

    # Stream from provider
    async for chunk in _stream_via_provider(
        db, user_id, book_id, message, messages, lang,
        request_id=request_id, cancelled=cancelled, request=request,
    ):
        yield chunk
