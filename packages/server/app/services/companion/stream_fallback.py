"""Fallback streaming for companion chat — multi-provider retry with circuit breaker."""

import asyncio
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

import structlog

from app.services.companion._disconnect import maybe_mark_disconnect
from app.services.companion.constants import STREAM_FLUSH_SIZE
from app.services.companion.safety import quick_safety_check
from app.services.companion.stream_cache import sse_chunk
from app.services.llm import get_llm
from app.services.llm.registry import get_registry
from app.services.companion.stream_cooldown import model_cooling, note_stream_failure
from app.services.companion.stream_pump import _emit_metadata_with_seq
from app.services.llm.tiers import is_config_error
from app.utils.i18n import t

logger = structlog.get_logger('read-pal.companion')

_STREAM_TIMEOUT_SECONDS = 120


def resolve_fallback_provider(
    lang: str,
    failed_provider_name: str | None = None,
) -> Any | None:
    """Find the next available fallback provider, or None.

    ``failed_provider_name`` is the provider that just failed; the fallback
    should skip it and use a *different* provider when one is available. Without
    it the registry could re-select the same provider that just failed.
    """
    registry = get_registry()
    next_state: Any | None = None
    if failed_provider_name:
        next_state = registry.next_provider_after(failed_provider_name)
    if next_state is None:
        next_state = registry.get_provider(feature='companion_stream')
    return next_state


async def _stream_from_fallback_llm(
    provider_name: str,
    model_used: str,
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    fallback_state: Any,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from a fallback LLM provider with buffered chunk output.

    D1: ``seq_state`` (when provided) is the shared per-request counter
    from ``_stream_via_provider`` — fallback chunks continue the same id
    sequence so Last-Event-ID reconnect resumes at the right offset even
    if the primary emitted some chunks before failing.
    """
    from app.services.companion.stream_provider import _stream_llm_kwargs

    try:
        llm_fb = get_llm(**_stream_llm_kwargs(provider_name, model=model_used))
    except Exception as init_exc:
        logger.error(
            'companion.stream.fallback_provider_init_failed',
            request_id=request_id, provider=provider_name,
            error=str(init_exc)[:500],
        )
        yield sse_chunk('[Fallback provider unavailable. Please try again.]')
        return
    logger.info(
        'companion.stream.fallback_retry',
        request_id=request_id,
        provider=provider_name,
        fallback_model=model_used,
    )
    fb_chunk_buffer: list[str] = []
    chunk_counter = 0
    async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
        async for chunk in llm_fb.astream(messages):
            chunk_counter += 1
            await maybe_mark_disconnect(
                request, cancelled, request_id, chunk_counter,
                model=model_used, provider=provider_name,
            )
            if cancelled is not None and cancelled.is_set():
                logger.info(
                    'companion.stream.fallback_cancelled_inside_astream',
                    request_id=request_id,
                    provider=provider_name,
                )
                break
            token = chunk.content
            # Tool-call / vision chunks emit content as a list of dicts; coerce
            # to text so ''.join below doesn't raise TypeError mid-stream.
            if isinstance(token, list):
                token = ''.join(
                    part.get('text', '') for part in token if isinstance(part, dict)
                )
            if token:
                collected_parts.append(token)
                fb_chunk_buffer.append(token)
                if len(fb_chunk_buffer) >= STREAM_FLUSH_SIZE:
                    buffered_text = ''.join(fb_chunk_buffer)
                    if quick_safety_check(buffered_text):
                        yield await _emit_fallback_with_seq(
                            buffered_text, request_id, seq_state,
                        )
                    fb_chunk_buffer = []
    if fb_chunk_buffer:
        buffered_text = ''.join(fb_chunk_buffer)
        if quick_safety_check(buffered_text):
            yield await _emit_fallback_with_seq(
                buffered_text, request_id, seq_state,
            )
    await fallback_state.circuit.record_success()
    logger.info(
        'companion.stream.fallback_completed',
        request_id=request_id,
        provider=provider_name,
        model=model_used,
        fallback=True,
        success=True,
    )


async def _emit_fallback_with_seq(
    content: str,
    request_id: str,
    seq_state: list[int] | None,
) -> str:
    """Build the next id-tagged SSE chunk and persist to replay buffer.

    D1 + D2 helper — mirrors ``streaming._emit_with_seq`` but lives here
    to avoid a circular import (streaming imports stream_fallback).
    """
    if seq_state is None:
        return sse_chunk(content)
    seq_state[0] += 1
    seq = seq_state[0]
    chunk = sse_chunk(content, request_id=request_id, seq=seq)
    from app.services.companion.stream_replay import append_chunk
    await append_chunk(request_id, seq, chunk)
    return chunk


def fallback_candidates(
    failed_provider_name: str | None,
    failed_model: str | None,
) -> list[tuple[Any, str, str]]:
    """Ordered ``(state, provider, model)`` hops to try after the primary failed.

    The same provider's fallback model goes first (P9.2): a rate-limited
    default usually leaves its smaller sibling untouched. The chain used to
    hop PROVIDERS only, so with one healthy provider it re-selected the very
    model that had just returned 429 and failed the turn a second time. The
    remaining providers' defaults follow, in the previous order.
    """
    chain: list[tuple[Any, str, str]] = []
    if failed_provider_name:
        state = get_registry().get_provider_by_name(failed_provider_name)
        # str check: a provider without a fallback model has None here.
        fb_model = state.config.fallback_model if state is not None else None
        if isinstance(fb_model, str) and fb_model and fb_model != failed_model:
            chain.append((state, failed_provider_name, fb_model))
    next_state = resolve_fallback_provider('', failed_provider_name)
    if next_state is not None:
        # The next provider is tried as a PROVIDER, so both of its models
        # are hops: a rate-limited default must not end the chain while its
        # sibling on the same key still answers.
        for model in _provider_models(next_state):
            hop = (next_state, next_state.config.name, model)
            if hop not in chain:
                chain.append(hop)
    return chain


def _provider_models(state: Any) -> list[str]:
    models = [state.config.default_model]
    fallback = state.config.fallback_model
    if isinstance(fallback, str) and fallback and fallback != models[0]:
        models.append(fallback)
    return models


def has_fresh_alternative(failed_provider_name: str | None, failed_model: str | None) -> bool:
    """Whether the fallback chain holds a model outside its rate-limit cooldown."""
    return any(
        not model_cooling(provider, model)
        for _, provider, model in fallback_candidates(failed_provider_name, failed_model)
    )


async def stream_fallback(
    messages: list[Any],
    collected_parts: list[str],
    request_id: str,
    start_time: float,
    user_id: UUID,
    book_id: UUID,
    lang: str,
    failed_provider_name: str | None = None,
    cancelled: asyncio.Event | None = None,
    request: Any = None,
    seq_state: list[int] | None = None,
    failed_model: str | None = None,
    primary_model: str | None = None,
    primary_provider: str | None = None,
) -> AsyncGenerator[str, None]:
    """Try streaming from the fallback chain (``fallback_candidates``).

    Each hop that is actually attempted announces itself with the B3
    metadata event first, so the client's "fallback model took over" notice
    names the model that really answers. Only a hop that failed BEFORE
    emitting anything advances the chain: once the reader has seen a hop's
    partial text, a fresh answer would be glued onto it.
    """
    chain = fallback_candidates(failed_provider_name, failed_model)
    # P9.2: prefer models that are not rate-limited right now; fall back to
    # the full chain when every candidate is cooling (never refuse a turn).
    fresh = [hop for hop in chain if not model_cooling(hop[1], hop[2])]
    for state, provider_name, model_used in (fresh or chain):
        if not await state.circuit.allow_request():
            continue
        yield await _emit_metadata_with_seq(
            request_id=request_id, model=model_used, fallback_used=True,
            primary_model=primary_model or failed_model,
            primary_provider=primary_provider or failed_provider_name,
            seq_state=seq_state,
        )
        emitted, shown_from = False, len(collected_parts)
        try:
            async for chunk in _stream_from_fallback_llm(
                provider_name, model_used, messages,
                collected_parts, request_id, state,
                cancelled=cancelled, request=request, seq_state=seq_state,
            ):
                emitted = True
                yield chunk
            return
        except Exception as fb_exc:  # noqa: BLE001 — every hop failure degrades, never raises
            logger.error(
                'companion.stream.fallback_failed',
                request_id=request_id,
                provider=provider_name,
                model=model_used,
                error=str(fb_exc)[:500],
            )
            await state.circuit.record_failure(config_error=is_config_error(fb_exc))
            note_stream_failure(provider_name, model_used, fb_exc)
            if emitted:
                break
            # Output is flushed in batches, so a hop can die with text
            # collected that the reader never saw. Drop it: the next hop
            # starts clean and the saved answer matches what was shown.
            del collected_parts[shown_from:]
    yield sse_chunk(t('companion.fallback_error', lang))
