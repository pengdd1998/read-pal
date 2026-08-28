"""SSE streaming for companion chat — per-provider circuit breaker, multi-provider fallback."""

import asyncio
import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.db import release_db
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.companion._disconnect import maybe_mark_disconnect
from app.services.companion.constants import (
    STREAM_FLUSH_SIZE,
)
from app.services.companion.context import (
    _build_messages,
    _prepare_context,
)
from app.services.companion.safety import persist_stream_log
from app.services.companion.stream_cache import (
    persist_stream_result,
    sse_chunk,
    sse_metadata_event,
    try_emit_cached,
)
from app.services.companion.stream_fallback import stream_fallback
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.utils.db import db_error_guard
from app.utils.i18n import DEFAULT_LANGUAGE, t
from app.utils.output_filter import filter_stream_chunk

logger = structlog.get_logger('read-pal.companion')

# Reserved output tokens for the daily token-budget pre-charge. Streaming
# calls settle with actual emitted tokens afterwards, so this is a
# conservative estimate based on observed companion response lengths.
_STREAM_RESERVED_OUTPUT_TOKENS = 800

# Explicit output cap passed to get_llm on the streaming path. Mirrors the
# pool default (2000) so the effective behavior is unchanged, but the cap is
# now deliberate and visible in the pool key instead of silently inheriting
# whatever default pool.get_llm ships with. Must stay >=
# _STREAM_RESERVED_OUTPUT_TOKENS so the budget pre-charge never reserves
# more than the vendor could actually emit.
_STREAM_MAX_OUTPUT_TOKENS = 2000

_STREAM_TIMEOUT_SECONDS = 120


async def _stream_with_llm(
    llm: Any,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    model_used: str,
    user_id: UUID,
    book_id: UUID,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from an LLM model with chunk buffering and logging.

    ``cancelled`` is checked between chunks so the inner ``astream`` loop
    exits promptly when the user clicks Stop — without this, the vendor
    keeps generating tokens until the 120s timeout closes the connection.

    B1: ``request`` (when provided) is polled every Nth chunk for client
    TCP disconnect. Starlette detects disconnect lazily; without this poll,
    a client closing the tab mid-stream leaves the vendor generating tokens
    until the 120s hard timeout fires.

    D1: ``seq_state`` is a single-element list used as a mutable counter.
    Each emitted chunk gets the next sequence number, written as
    ``id: {request_id}:{seq}\\n`` before the data line — that id becomes
    the ``Last-Event-ID`` header on client reconnect (D3 + D4). Each
    emitted chunk is also appended to the Redis replay buffer (D2) so
    reconnect can resume from the right offset.
    """
    chunk_buffer: list[str] = []
    first_token_received = False
    ttft_ms: int | None = None
    chunk_counter = 0
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm.astream(messages):
            chunk_counter += 1
            # B1: client-disconnect probe (throttled). Set on disconnect
            # so the upstream finally block skips persistence + the
            # downstream vendor stream gets GC'd via the cancelled event.
            await maybe_mark_disconnect(
                request, cancelled, request_id, chunk_counter,
                model=model_used,
            )
            # Cooperative cancel: check between chunks. When set, break out
            # of the vendor stream so its underlying httpx connection gets
            # closed when this generator is GC'd.
            if cancelled is not None and cancelled.is_set():
                logger.info(
                    'companion.stream.cancelled_inside_astream',
                    request_id=request_id,
                    model=model_used,
                )
                break
            token = chunk.content
            # Tool-call / vision chunks emit content as a list of dicts; coerce
            # to text so ''.join below (and PII redaction) doesn't raise TypeError.
            if isinstance(token, list):
                token = ''.join(
                    part.get('text', '') for part in token if isinstance(part, dict)
                )
            if token:
                if not first_token_received:
                    first_token_received = True
                    ttft_ms = int((time.monotonic() - start_time) * 1000)
                collected_parts.append(token)
                chunk_buffer.append(token)
                if len(chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(chunk_buffer)
                    safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
                    if safe_text:
                        yield await _emit_with_seq(safe_text, request_id, seq_state)
                    chunk_buffer = []
    if chunk_buffer:
        buffered_text = ''.join(chunk_buffer)
        safe_text = filter_stream_chunk(buffered_text, context='companion_stream')
        if safe_text:
            yield await _emit_with_seq(safe_text, request_id, seq_state)
    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        'companion.stream.completed',
        request_id=request_id,
        model=model_used,
        latency_ms=latency_ms,
        ttft_ms=ttft_ms,
        chunk_count=len(collected_parts),
        success=True,
    )
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=True, user_id=user_id, book_id=book_id,
        ttft_ms=ttft_ms,
    )


async def _emit_with_seq(
    content: str,
    request_id: str,
    seq_state: list[int] | None,
) -> str:
    """Build the next id-tagged SSE chunk and persist to replay buffer.

    D1 + D2 helper. When ``seq_state`` is None (terminal/error frames, or
    the legacy cached-response path), falls back to the un-tagged chunk
    format — backward compat preserved.

    When ``seq_state`` is provided:
    - Increment the counter (mutates ``seq_state[0]``).
    - Build ``sse_chunk(content, request_id, seq)`` — emits ``id:`` line.
    - Persist to Redis replay buffer so D3 reconnect can resume.
    """
    if seq_state is None:
        return sse_chunk(content)
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_chunk(content, request_id=request_id, seq=seq)
    # D2: append to replay buffer. Best-effort — never blocks the stream.
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk


async def _emit_metadata_with_seq(
    *,
    request_id: str,
    model: str,
    fallback_used: bool,
    primary_model: str | None = None,
    primary_provider: str | None = None,
    seq_state: list[int] | None = None,
) -> str:
    """Build the next id-tagged metadata event and persist to replay buffer.

    D1 + D2 + B3 helper — mirrors ``_emit_with_seq`` but for metadata
    events so the B3 fallback notice is also replayable on reconnect.
    """
    if seq_state is None:
        return sse_metadata_event(
            request_id=request_id, model=model, fallback_used=fallback_used,
            primary_model=primary_model, primary_provider=primary_provider,
        )
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_metadata_event(
        request_id=request_id, model=model, fallback_used=fallback_used,
        primary_model=primary_model, primary_provider=primary_provider, seq=seq,
    )
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk


def _get_stream_provider(
    registry: Any,
    request_id: str,
) -> tuple[Any, str, str] | None:
    """Resolve a streaming provider. Returns (state, provider_name, model_used) or None."""
    state = registry.get_provider(feature='companion_stream')
    if state is None:
        logger.warning('companion.stream.no_provider', request_id=request_id)
        return None
    return state, state.config.name, state.config.default_model


async def _handle_stream_failure(
    exc: Exception,
    state: Any,
    provider_name: str,
    model_used: str,
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Log and record a primary provider streaming failure."""
    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.error(
        'companion.stream.failed',
        request_id=request_id, provider=provider_name,
        model=model_used, latency_ms=latency_ms, success=False,
        error=str(exc)[:500],
    )
    await state.circuit.record_failure()
    registry = get_registry()
    registry.record_latency(provider_name, latency_ms, False)
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=False, error_message=str(exc)[:500],
        user_id=user_id, book_id=book_id,
    )


async def _stream_from_provider(
    state: Any,
    provider_name: str,
    model_used: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
    cancelled: asyncio.Event | None = None,
    billing_state: dict | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from primary provider with circuit breaker fallback on failure.

    ``billing_state`` (when provided) is updated with ``partial_chars`` when
    primary emits output before failing and the partial is discarded prior
    to fallback. The caller uses this to bill the user for the primary's
    partial output too (the vendor bills us for it, and the user did see
    it streamed live before the fallback took over).
    """
    if not await state.circuit.allow_request():
        logger.warning(
            'companion.stream.circuit_blocked',
            request_id=request_id,
            provider=provider_name,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        # B3: emit metadata before fallback so client can surface quality
        # downgrade. Even circuit-blocked counts as "primary unavailable" —
        # the user is getting a different provider than the router picked.
        fb_meta = _resolve_fallback_metadata(
            failed_provider_name=provider_name,
            failed_model=model_used,
        )
        if fb_meta is not None:
            yield await _emit_metadata_with_seq(
                request_id=request_id,
                model=fb_meta['model'],
                fallback_used=True,
                primary_model=model_used,
                primary_provider=provider_name,
                seq_state=seq_state,
            )
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang, failed_provider_name=provider_name,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk
        return

    try:
        llm = get_llm(provider=provider_name, max_tokens=_STREAM_MAX_OUTPUT_TOKENS)
        async for chunk in _stream_with_llm(
            llm, messages, collected_parts, request_id,
            start_time, model_used, user_id, book_id,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk
    except Exception as exc:
        await _handle_stream_failure(
            exc, state, provider_name, model_used,
            request_id, start_time, user_id, book_id,
        )
        # Discard partial primary output before fallback so the user
        # doesn't see "Once upon a time..." glued to a fresh response
        # starting with "I understand you're asking...". Without this,
        # persist_stream_result would save the corrupt concat too.
        partial_len = sum(len(p) for p in collected_parts)
        if partial_len:
            logger.warning(
                'companion.stream.partial_discarded',
                request_id=request_id,
                provider=provider_name,
                partial_chars=partial_len,
            )
            if billing_state is not None:
                # Preserve partial char count for billing — the user saw
                # these tokens streamed live, so they should be billed
                # even though collected_parts is cleared for fallback.
                billing_state['partial_chars'] = (
                    billing_state.get('partial_chars', 0) + partial_len
                )
            collected_parts.clear()
        # B3: emit metadata before fallback chunks — primary failed mid-stream
        # and the user is now getting a different model's output.
        fb_meta = _resolve_fallback_metadata(
            failed_provider_name=provider_name,
            failed_model=model_used,
        )
        if fb_meta is not None:
            yield await _emit_metadata_with_seq(
                request_id=request_id,
                model=fb_meta['model'],
                fallback_used=True,
                primary_model=model_used,
                primary_provider=provider_name,
                seq_state=seq_state,
            )
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang, failed_provider_name=provider_name,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk


def _resolve_fallback_metadata(
    *,
    failed_provider_name: str,
    failed_model: str,
) -> dict | None:
    """Resolve the fallback provider/model the stream will switch to.

    Returns ``{'provider': str, 'model': str}`` or None when no fallback is
    available (caller should skip the metadata event — the user gets a
    fallback-error chunk from ``stream_fallback`` instead).
    """
    from app.services.companion.stream_fallback import resolve_fallback_provider
    next_state = resolve_fallback_provider(
        lang='', failed_provider_name=failed_provider_name,
    )
    if next_state is None:
        return None
    return {
        'provider': next_state.config.name,
        'model': next_state.config.default_model,
    }


async def _persist_with_retry(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    lang: str | None = None,
) -> bool:
    """Persist streaming result with one retry. Returns True on success.

    On DBAPIError the SQLAlchemy async session enters a broken state; we
    must rollback before the next attempt (or before ``get_db`` returns the
    connection to the pool) — otherwise every subsequent statement on this
    session raises ``PendingRollbackError``.
    """
    last_exc: Exception | None = None
    for attempt in (0, 1):
        try:
            async with db_error_guard(
                'companion.stream.persist_result',
                request_id=request_id, attempt=attempt,
                user_id=str(user_id), book_id=str(book_id),
            ):
                await persist_stream_result(
                    db, user_id, book_id, message, messages,
                    collected_parts, request_id, lang=lang,
                )
            return True
        except DBAPIError as exc:
            last_exc = exc
            logger.warning(
                'companion.stream.persist_dbapi_error',
                request_id=request_id, attempt=attempt,
                error=str(exc)[:200],
            )
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001 — best-effort rollback
                logger.warning(
                    'companion.stream.persist_rollback_failed',
                    request_id=request_id, attempt=attempt,
                )
        except OSError as exc:
            last_exc = exc
            logger.warning(
                'companion.stream.persist_oserror',
                request_id=request_id, attempt=attempt,
                error=str(exc)[:200],
            )
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001 — best-effort rollback
                pass

    logger.error(
        'companion.stream.persist_failed_final',
        request_id=request_id,
        user_id=str(user_id),
        book_id=str(book_id),
        error=str(last_exc)[:200] if last_exc else 'unknown',
    )
    return False



async def _settle_token_budget(
    user_id_str: str,
    request_id: str,
    pre_charge: int,
    token_limit: int,
    messages: list,
    collected_parts: list[str],
    billing_state: dict,
) -> None:
    """Settle the token-budget pre-charge with actual emitted tokens.

    P0.2: settle with what the user actually saw — collected_parts accumulates
    across primary + fallback, and billing_state['partial_chars'] counts any
    primary partial that was discarded before fallback ran. Empty output means
    a full refund.
    """
    if token_limit <= 0 or pre_charge <= 0:
        return
    from app.middleware.daily_llm_budget import estimate_input_tokens, _get_budget

    emitted_chars = sum(len(p) for p in collected_parts)
    emitted_chars += billing_state.get('partial_chars', 0)
    if emitted_chars > 0:
        actual_output_tokens = max(emitted_chars // 4, 1)
        actual_total = estimate_input_tokens(messages) + actual_output_tokens
        try:
            await _get_budget().settle_tokens(user_id_str, pre_charge, actual_total)
        except Exception as exc:  # noqa: BLE001 — settle best-effort
            logger.debug(
                'companion.stream.token_settle_failed',
                request_id=request_id, error=str(exc)[:200],
            )
    else:
        try:
            await _get_budget().settle_tokens(user_id_str, pre_charge, 0)
        except Exception as exc:  # noqa: BLE001 — refund best-effort
            logger.debug(
                'companion.stream.token_refund_failed',
                request_id=request_id, error=str(exc)[:200],
            )

async def _stream_via_provider(  # noqa: PLR0915 — single orchestration flow; decomposition tracked as follow-up
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

        persist_ok = await _persist_with_retry(
            db, user_id, book_id, message, messages,
            collected_parts, actual_request_id, lang=lang,
        )
        if not persist_ok:
            # Tell the client the streamed response couldn't be saved.
            # Client should keep visible text (user already read it) but
            # warn that reload will lose the message.
            yield f'data: {json.dumps({"error": "persist_failed"})}\n\n'

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
