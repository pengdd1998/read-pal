"""Safe LLM invoke — circuit breaker, multi-provider fallback, caching, JSON parsing."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

import structlog
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings
from app.services.llm.text import _strip_markdown_fences, _validate_parsed

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Rate-limit retry
# ---------------------------------------------------------------------------

_RATE_LIMIT_BACKOFFS = [2, 4, 8]  # seconds to wait between 429 retries


def _is_rate_limited(exc: Exception) -> bool:
    """Check if an exception indicates a 429 rate limit response."""
    msg = str(exc).lower()
    return '429' in msg or 'rate' in msg


async def _invoke_with_retry(
    llm: ChatOpenAI,
    messages: list[BaseMessage],
    log_label: str,
) -> Any:
    """Invoke LLM with exponential backoff on 429 rate limit errors."""
    last_exc: Exception | None = None
    for attempt, backoff in enumerate(_RATE_LIMIT_BACKOFFS):
        try:
            return await llm.ainvoke(messages)
        except Exception as exc:
            last_exc = exc
            if _is_rate_limited(exc) and attempt < len(_RATE_LIMIT_BACKOFFS):
                logger.warning(
                    'llm_rate_limited',
                    label=log_label,
                    attempt=attempt + 1,
                    max_attempts=len(_RATE_LIMIT_BACKOFFS),
                    backoff_seconds=backoff,
                )
                await asyncio.sleep(backoff)
                continue
            raise
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Core invoke with per-provider circuit breaker + multi-provider fallback
# ---------------------------------------------------------------------------


async def _record_success(
    *,
    state: Any,
    provider_name: str,
    registry: Any,
    request_id: str,
    model_used: str,
    log_label: str,
    start: float,
    response: Any,
    user_id: str | None,
    book_id: str | None,
) -> None:
    """Record a successful LLM invocation: metrics + observability log."""
    from app.services.llm.observability import _extract_usage, _log_call

    latency_ms = int((time.monotonic() - start) * 1000)
    await state.circuit.record_success()
    registry.record_latency(provider_name, latency_ms, True)
    usage = _extract_usage(response)
    _log_call(
        request_id=request_id,
        model=model_used,
        label=log_label,
        latency_ms=latency_ms,
        usage=usage,
        success=True,
        provider=provider_name,
        user_id=user_id,
        book_id=book_id,
    )


async def _record_failure(
    *,
    state: Any,
    provider_name: str,
    registry: Any,
    request_id: str,
    model_used: str,
    log_label: str,
    start: float,
    exc: Exception,
    user_id: str | None,
    book_id: str | None,
) -> None:
    """Record a failed LLM invocation: circuit breaker + metrics + log."""
    from app.services.llm.observability import _log_call

    latency_ms = int((time.monotonic() - start) * 1000)
    logger.error(
        'llm_primary_failed',
        label=log_label,
        provider=provider_name,
        model=model_used,
        error=str(exc),
    )
    await state.circuit.record_failure()
    registry.record_latency(provider_name, latency_ms, False)
    _log_call(
        request_id=request_id,
        model=model_used,
        label=log_label,
        latency_ms=latency_ms,
        usage={},
        success=False,
        provider=provider_name,
        error_message=str(exc)[:500],
        user_id=user_id,
        book_id=book_id,
    )


async def _handle_invoke_failure(
    *,
    state: Any,
    provider_name: str,
    registry: Any,
    request_id: str,
    model_used: str,
    log_label: str,
    start: float,
    exc: Exception,
    messages: list[BaseMessage],
    user_id: str | None,
    book_id: str | None,
) -> Any:
    """Record failure, log it, and attempt fallback providers."""
    await _record_failure(
        state=state,
        provider_name=provider_name,
        registry=registry,
        request_id=request_id,
        model_used=model_used,
        log_label=log_label,
        start=start,
        exc=exc,
        user_id=user_id,
        book_id=book_id,
    )
    response = await _try_next_provider(
        messages, registry, provider_name, request_id, log_label,
        start_time=start,
        user_id=user_id, book_id=book_id,
    )
    if response is None:
        fb_model = state.config.fallback_model
        if fb_model:
            response = await _try_same_provider_fallback(
                messages, state, fb_model, request_id, log_label,
                start_time=start,
                user_id=user_id, book_id=book_id,
            )
    return response


async def _invoke_with_circuit(
    messages: list[BaseMessage],
    *,
    log_label: str = 'LLM',
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
) -> Any:
    """Low-level invoke with per-provider circuit breaker + multi-provider fallback."""
    from app.services.llm.pool import get_llm
    from app.services.llm.registry import get_registry

    registry = get_registry()
    effective_feature = feature or log_label
    request_id = uuid.uuid4().hex[:12]
    start = time.monotonic()

    # Select provider
    state = registry.get_provider(feature=effective_feature)
    if state is None:
        logger.warning('llm_no_provider_available', label=log_label)
        return None

    # Per-provider circuit breaker gate
    if not await state.circuit.allow_request():
        logger.warning(
            'llm_circuit_blocked',
            label=log_label,
            provider=state.config.name,
        )
        return await _try_next_provider(
            messages, registry, state.config.name, request_id, log_label,
            start_time=start,
            user_id=user_id, book_id=book_id,
        )

    model_used = state.config.default_model
    provider_name = state.config.name
    try:
        llm = get_llm(provider=provider_name)
        response = await _invoke_with_retry(llm, messages, log_label)
        await _record_success(
            state=state,
            provider_name=provider_name,
            registry=registry,
            request_id=request_id,
            model_used=model_used,
            log_label=log_label,
            start=start,
            response=response,
            user_id=user_id,
            book_id=book_id,
        )
        return response
    except Exception as exc:
        return await _handle_invoke_failure(
            state=state,
            provider_name=provider_name,
            registry=registry,
            request_id=request_id,
            model_used=model_used,
            log_label=log_label,
            start=start,
            exc=exc,
            messages=messages,
            user_id=user_id,
            book_id=book_id,
        )


async def _try_next_provider(
    messages: list[BaseMessage],
    registry: Any,
    failed_provider: str,
    request_id: str,
    log_label: str,
    *,
    start_time: float,
    user_id: str | None = None,
    book_id: str | None = None,
) -> Any:
    """Try the next available provider after the failed one."""
    from app.services.llm.observability import _extract_usage, _log_call
    from app.services.llm.pool import get_llm

    next_state = registry.next_provider_after(failed_provider)
    if next_state is None:
        logger.error('llm_all_providers_exhausted', label=log_label)
        return None

    provider_name = next_state.config.name
    model_used = next_state.config.default_model

    # Circuit breaker gate for next provider
    if not await next_state.circuit.allow_request():
        # Recursively try the one after that (but avoid infinite loop)
        if provider_name != failed_provider:
            return await _try_next_provider(
                messages, registry, provider_name, request_id, log_label,
                start_time=start_time,
                user_id=user_id, book_id=book_id,
            )
        return None

    fb_start = time.monotonic()
    try:
        logger.info(
            'llm_next_provider_retry',
            label=log_label,
            provider=provider_name,
            model=model_used,
        )
        llm = get_llm(provider=provider_name)
        response = await _invoke_with_retry(llm, messages, log_label)
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        await next_state.circuit.record_success()
        registry.record_latency(provider_name, latency_ms, True)
        usage = _extract_usage(response)
        _log_call(
            request_id=request_id,
            model=model_used,
            label=log_label,
            latency_ms=latency_ms,
            usage=usage,
            success=True,
            fallback_used=True,
            provider=provider_name,
            user_id=user_id,
            book_id=book_id,
        )
        return response
    except Exception as exc:
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        logger.error(
            'llm_next_provider_failed',
            label=log_label,
            provider=provider_name,
            error=str(exc)[:300],
        )
        await next_state.circuit.record_failure()
        registry.record_latency(provider_name, latency_ms, False)
        _log_call(
            request_id=request_id,
            model=model_used,
            label=log_label,
            latency_ms=latency_ms,
            usage={},
            success=False,
            fallback_used=True,
            provider=provider_name,
            error_message=str(exc)[:500],
            user_id=user_id,
            book_id=book_id,
        )
        return None


async def _try_same_provider_fallback(
    messages: list[BaseMessage],
    state: Any,
    fallback_model: str,
    request_id: str,
    log_label: str,
    *,
    start_time: float,
    user_id: str | None = None,
    book_id: str | None = None,
) -> Any:
    """Try the fallback model from the same provider (legacy behavior)."""
    from app.services.llm.observability import _extract_usage, _log_call
    from app.services.llm.pool import get_llm

    provider_name = state.config.name
    fb_start = time.monotonic()
    try:
        logger.info(
            'llm_same_provider_fallback',
            label=log_label,
            provider=provider_name,
            fallback_model=fallback_model,
        )
        llm = get_llm(provider=provider_name, model=fallback_model)
        response = await _invoke_with_retry(llm, messages, log_label)
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        await state.circuit.record_success()
        usage = _extract_usage(response)
        _log_call(
            request_id=request_id,
            model=fallback_model,
            label=log_label,
            latency_ms=latency_ms,
            usage=usage,
            success=True,
            fallback_used=True,
            provider=provider_name,
            user_id=user_id,
            book_id=book_id,
        )
        return response
    except Exception as exc:
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        logger.error(
            'llm_same_provider_fallback_failed',
            label=log_label,
            provider=provider_name,
            error=str(exc)[:300],
        )
        _log_call(
            request_id=request_id,
            model=fallback_model,
            label=log_label,
            latency_ms=latency_ms,
            usage={},
            success=False,
            fallback_used=True,
            provider=provider_name,
            error_message=str(exc)[:500],
            user_id=user_id,
            book_id=book_id,
        )
        return None


# ---------------------------------------------------------------------------
# Public safe-call API
# ---------------------------------------------------------------------------


async def safe_llm_invoke(
    messages: list[BaseMessage],
    *,
    fallback: Any = None,
    log_label: str = 'LLM',
    schema_class: type | None = None,
    use_cache: bool = True,
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
) -> Any:
    """Invoke LLM with circuit breaker, multi-provider fallback, caching, JSON parsing."""
    from app.services.llm.cache import _cache_get, _cache_key, _cache_set

    effective_feature = feature or log_label
    key = _cache_key(messages, log_label) if use_cache else ''

    # Try cache first
    if key:
        cached = await _cache_get(key)
        if cached is not None:
            try:
                parsed = json.loads(cached)
                if schema_class is not None:
                    parsed = _validate_parsed(parsed, schema_class, log_label)
                return parsed
            except json.JSONDecodeError:
                pass

    response = await _invoke_with_circuit(
        messages, log_label=log_label,
        user_id=user_id, book_id=book_id,
        feature=effective_feature,
    )
    if response is None:
        return fallback

    content = response.content.strip()
    content = _strip_markdown_fences(content)

    # Cache the raw content for future use
    if key:
        await _cache_set(key, content)

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning(
            'llm_json_parse_failed',
            label=log_label,
            content_preview=content[:200],
        )
        return fallback

    if schema_class is not None:
        parsed = _validate_parsed(parsed, schema_class, log_label)

    return parsed


async def safe_llm_call(
    messages: list[BaseMessage],
    *,
    fallback: str = '',
    log_label: str = 'LLM',
    use_cache: bool = True,
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
) -> str:
    """Invoke LLM with circuit breaker + multi-provider fallback, returning raw text."""
    from app.services.llm.cache import _cache_get, _cache_key, _cache_set

    effective_feature = feature or log_label
    key = _cache_key(messages, log_label) if use_cache else ''

    # Try cache first
    if key:
        cached = await _cache_get(key)
        if cached is not None:
            from app.utils.output_filter import filter_output
            return filter_output(cached, context=log_label)

    response = await _invoke_with_circuit(
        messages, log_label=log_label,
        user_id=user_id, book_id=book_id,
        feature=effective_feature,
    )
    if response is None:
        return fallback
    content = response.content.strip()

    # Cache the raw content for future use
    if key:
        await _cache_set(key, content)

    # Apply output filter
    from app.utils.output_filter import filter_output
    content = filter_output(content, context=log_label)

    return content
