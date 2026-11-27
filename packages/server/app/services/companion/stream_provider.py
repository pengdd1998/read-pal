"""Primary-provider streaming + circuit-breaker fallback orchestration.

Extracted from streaming.py (see stream_pump.py header). This module owns:
which provider streams, circuit-open handling, and failure recording. The
B3 metadata event (user downgraded to a fallback) is emitted by
``stream_fallback`` for the hop that actually answers.
"""

import asyncio
import time
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion.safety import persist_stream_log
from app.services.companion.stream_cooldown import model_cooling, note_rate_limited
from app.services.companion.stream_fallback import has_fresh_alternative, stream_fallback
from app.services.companion.stream_pump import _stream_with_llm
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.services.llm.tiers import is_config_error, is_rate_limited

logger = structlog.get_logger('read-pal.companion')

# Explicit output cap passed to get_llm on the streaming path. Mirrors the
# pool default (2000) so the effective behavior is unchanged, but the cap is
# now deliberate and visible in the pool key instead of silently inheriting
# whatever default pool.get_llm ships with. Must stay >=
# _STREAM_RESERVED_OUTPUT_TOKENS (streaming.py) so the budget pre-charge never
# reserves more than the vendor could actually emit.
_STREAM_MAX_OUTPUT_TOKENS = 2000


def _stream_llm_kwargs(provider_name: str, model: str | None = None) -> dict[str, Any]:
    """get_llm kwargs for a companion stream — primary or fallback hop.

    ``max_retries=0``: this path owns a fallback chain, so a 429 must
    surface at once instead of after the SDK's silent client retries.
    """
    from app.config import get_settings

    kwargs: dict[str, Any] = {
        'provider': provider_name, 'max_tokens': _STREAM_MAX_OUTPUT_TOKENS, 'max_retries': 0,
    }
    if model:
        kwargs['model'] = model
    if get_settings().llm_stream_disable_thinking:
        kwargs['disable_thinking'] = True
    return kwargs


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
    # P9.1: a config error (retired model, revoked key) trips a long cooldown.
    await state.circuit.record_failure(config_error=is_config_error(exc))
    # P9.2: a 429 parks THIS model briefly; the provider's sibling is fine.
    if is_rate_limited(exc):
        note_rate_limited(provider_name, model_used)
    registry = registry if registry is not None else get_registry()
    registry.record_latency(provider_name, latency_ms, False)
    persist_stream_log(
        request_id=request_id, model=model_used, latency_ms=latency_ms,
        success=False, error_message=str(exc)[:500],
        user_id=user_id, book_id=book_id, provider=provider_name,
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
    # P9.2: skip a model that just returned 429, but only when the chain
    # holds a model that is not cooling — a single-model deployment must
    # still try (the failed attempt costs ~0.2s, not a refused turn).
    cooling = (
        model_cooling(provider_name, model_used)
        and has_fresh_alternative(provider_name, model_used)
    )
    if cooling or not await state.circuit.allow_request():
        logger.warning(
            'companion.stream.model_rate_limited' if cooling else 'companion.stream.circuit_blocked',
            request_id=request_id,
            provider=provider_name,
            model=model_used,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        # Either way the user is getting a different model than the router
        # picked. stream_fallback announces whichever hop answers (B3).
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang, failed_provider_name=provider_name,
            failed_model=model_used, primary_model=model_used,
            primary_provider=provider_name,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk
        return

    try:
        llm = get_llm(**_stream_llm_kwargs(provider_name))
        async for chunk in _stream_with_llm(
            llm, messages, collected_parts, request_id,
            start_time, model_used, user_id, book_id,
            cancelled=cancelled, request=request, seq_state=seq_state,
            provider_name=provider_name,
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
        # stream_fallback emits the B3 metadata (fallback model took over)
        # before its first chunk, then works down the fallback chain.
        async for chunk in stream_fallback(
            messages, collected_parts, request_id, start_time,
            user_id, book_id, lang, failed_provider_name=provider_name,
            failed_model=model_used, primary_model=model_used,
            primary_provider=provider_name,
            cancelled=cancelled, request=request, seq_state=seq_state,
        ):
            yield chunk
