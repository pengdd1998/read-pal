"""Safe LLM invoke — circuit breaker, fallback model, caching, JSON parsing."""

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
    # All retries exhausted
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Core invoke with circuit breaker + fallback model + observability
# ---------------------------------------------------------------------------


async def _invoke_with_circuit(
    messages: list[BaseMessage],
    *,
    log_label: str = 'LLM',
    user_id: str | None = None,
    book_id: str | None = None,
) -> Any:
    """Low-level invoke with circuit breaker + fallback model + observability.

    Returns the raw response object on success, or None on total failure.
    Records circuit breaker state transitions and structured call logs.
    """
    from app.services.llm.circuit_breaker import circuit
    from app.services.llm.observability import _extract_usage, _log_call
    from app.services.llm.pool import get_llm

    settings = get_settings()
    request_id = uuid.uuid4().hex[:12]
    start = time.monotonic()

    # Circuit breaker gate
    if not await circuit.allow_request():
        logger.warning('llm_blocked_by_circuit_breaker', label=log_label)
        return None

    model_used = settings.default_model
    try:
        llm = get_llm()
        response = await _invoke_with_retry(llm, messages, log_label)
        latency_ms = int((time.monotonic() - start) * 1000)
        await circuit.record_success()
        usage = _extract_usage(response)
        _log_call(
            request_id=request_id,
            model=model_used,
            label=log_label,
            latency_ms=latency_ms,
            usage=usage,
            success=True,
            user_id=user_id,
            book_id=book_id,
        )
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            'llm_primary_failed',
            label=log_label,
            model=model_used,
            error=str(exc),
        )
        await circuit.record_failure()
        _log_call(
            request_id=request_id,
            model=model_used,
            label=log_label,
            latency_ms=latency_ms,
            usage={},
            success=False,
            error_message=str(exc)[:500],
            user_id=user_id,
            book_id=book_id,
        )
        # Try fallback model
        response = await _try_fallback(
            messages, settings, request_id, log_label,
            user_id=user_id, book_id=book_id,
        )
        if response is None:
            return None

    return response


async def _try_fallback(
    messages: list[BaseMessage],
    settings: Any,
    request_id: str,
    log_label: str,
    *,
    user_id: str | None = None,
    book_id: str | None = None,
) -> Any:
    """Attempt fallback model invocation after primary failure."""
    from app.services.llm.circuit_breaker import circuit
    from app.services.llm.observability import _extract_usage, _log_call
    from app.services.llm.pool import get_llm

    fb_start = time.monotonic()
    fallback_model = settings.fallback_model
    try:
        logger.info('llm_fallback_retry', label=log_label, fallback_model=fallback_model)
        llm = get_llm(model=fallback_model)
        response = await _invoke_with_retry(llm, messages, log_label)
        fb_latency_ms = int((time.monotonic() - fb_start) * 1000)
        await circuit.record_success()
        usage = _extract_usage(response)
        _log_call(
            request_id=request_id,
            model=fallback_model,
            label=log_label,
            latency_ms=fb_latency_ms,
            usage=usage,
            success=True,
            fallback_used=True,
            user_id=user_id,
            book_id=book_id,
        )
        return response
    except Exception as fb_exc:
        logger.error('llm_fallback_failed', label=log_label, error=str(fb_exc))
        await circuit.record_failure()
        _log_call(
            request_id=request_id,
            model=fallback_model,
            label=log_label,
            latency_ms=int((time.monotonic() - fb_start) * 1000),
            usage={},
            success=False,
            fallback_used=True,
            error_message=str(fb_exc),
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
) -> Any:
    """Invoke LLM with circuit breaker, fallback model, caching, and JSON parsing.

    On primary model failure the configured ``fallback_model`` is tried.
    Returns parsed JSON (optionally validated against *schema_class*),
    stripped markdown fences, or *fallback* on failure.
    """
    from app.services.llm.cache import _cache_get, _cache_key, _cache_set

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
) -> str:
    """Invoke LLM with circuit breaker + fallback model, returning raw text.

    Unlike ``safe_llm_invoke``, this does NOT attempt JSON parsing.
    Returns the response content as a string, or *fallback* on failure.
    Applies output safety filtering.
    """
    from app.services.llm.cache import _cache_get, _cache_key, _cache_set

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
