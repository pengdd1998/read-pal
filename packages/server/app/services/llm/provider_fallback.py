"""Provider fallback strategies — recording, next-provider, and same-provider fallback."""

from __future__ import annotations

import time
from typing import Any

import structlog
from langchain_core.messages import BaseMessage

from app.services.llm.retry import _invoke_with_retry

logger = structlog.get_logger('read-pal.llm')


# ---------------------------------------------------------------------------
# Metrics / observability helpers
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


# ---------------------------------------------------------------------------
# Fallback invoke helpers
# ---------------------------------------------------------------------------


async def _invoke_and_record_fallback(
    messages: list[BaseMessage],
    llm: Any,
    state: Any,
    provider_name: str,
    model_used: str,
    request_id: str,
    log_label: str,
    registry: Any | None = None,
    *,
    user_id: str | None = None,
    book_id: str | None = None,
) -> Any:
    """Try LLM invoke with retry, record success/failure metrics. Returns response or None."""
    from app.services.llm.observability import _extract_usage, _log_call

    fb_start = time.monotonic()
    try:
        response = await _invoke_with_retry(llm, messages, log_label)
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        await state.circuit.record_success()
        if registry:
            registry.record_latency(provider_name, latency_ms, True)
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage=_extract_usage(response),
            success=True, fallback_used=True, provider=provider_name,
            user_id=user_id, book_id=book_id,
        )
        return response
    except Exception as exc:
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        logger.error(
            'llm_fallback_failed', label=log_label,
            provider=provider_name, error=str(exc)[:300],
        )
        await state.circuit.record_failure()
        if registry:
            registry.record_latency(provider_name, latency_ms, False)
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage={}, success=False,
            fallback_used=True, provider=provider_name,
            error_message=str(exc)[:500],
            user_id=user_id, book_id=book_id,
        )
        return None


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
    from app.services.llm.pool import get_llm

    next_state = registry.next_provider_after(failed_provider)
    if next_state is None:
        logger.error('llm_all_providers_exhausted', label=log_label)
        return None

    provider_name = next_state.config.name
    model_used = next_state.config.default_model

    if not await next_state.circuit.allow_request():
        if provider_name != failed_provider:
            return await _try_next_provider(
                messages, registry, provider_name, request_id, log_label,
                start_time=start_time, user_id=user_id, book_id=book_id,
            )
        return None

    logger.info('llm_next_provider_retry', label=log_label, provider=provider_name, model=model_used)
    llm = get_llm(provider=provider_name)
    return await _invoke_and_record_fallback(
        messages, llm, next_state, provider_name, model_used,
        request_id, log_label, registry,
        user_id=user_id, book_id=book_id,
    )


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
    from app.services.llm.pool import get_llm

    provider_name = state.config.name
    logger.info('llm_same_provider_fallback', label=log_label, provider=provider_name, fallback_model=fallback_model)
    llm = get_llm(provider=provider_name, model=fallback_model)
    return await _invoke_and_record_fallback(
        messages, llm, state, provider_name, fallback_model,
        request_id, log_label,
        user_id=user_id, book_id=book_id,
    )
