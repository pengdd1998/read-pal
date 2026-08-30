"""Primary-provider streaming + circuit-breaker fallback orchestration.

Extracted from streaming.py (see stream_pump.py header). This module owns:
which provider streams, circuit-open handling, failure recording, and the
B3 metadata event emitted whenever the user is downgraded to a fallback.
"""

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion.safety import persist_stream_log
from app.services.companion.stream_fallback import stream_fallback
from app.services.companion.stream_pump import _stream_with_llm, _emit_metadata_with_seq
from app.services.llm import get_llm
from app.services.llm.registry import get_registry

logger = structlog.get_logger('read-pal.companion')

# Explicit output cap passed to get_llm on the streaming path. Mirrors the
# pool default (2000) so the effective behavior is unchanged, but the cap is
# now deliberate and visible in the pool key instead of silently inheriting
# whatever default pool.get_llm ships with. Must stay >=
# _STREAM_RESERVED_OUTPUT_TOKENS (streaming.py) so the budget pre-charge never
# reserves more than the vendor could actually emit.
_STREAM_MAX_OUTPUT_TOKENS = 2000


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
    registry: Any | None = None,
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
    registry = registry if registry is not None else get_registry()
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
    registry: Any | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from primary provider with circuit breaker fallback on failure.

    ``billing_state`` (when provided) is updated with ``partial_chars`` when
    primary emits output before failing and the partial is discarded prior
    to fallback. The caller uses this to bill the user for the primary's
    partial output too (the vendor bills us for it, and the user did see
    it streamed live before the fallback took over).

    ``registry`` threads the caller's provider registry through so the
    failure path records latency against the same registry instance that
    resolved the provider (single resolution per request).
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
            registry=registry,
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
