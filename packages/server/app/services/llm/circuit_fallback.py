"""Circuit-breaker invoke with multi-provider fallback."""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog
from langchain_core.messages import BaseMessage

from app.services.llm.provider_fallback import (
    _record_failure,
    _record_success,
    _try_next_provider,
    _try_same_provider_fallback,
)
from app.services.llm.retry import _invoke_with_retry

logger = structlog.get_logger('read-pal.llm')


# ---------------------------------------------------------------------------
# Provider selection
# ---------------------------------------------------------------------------


def _select_provider(
    registry: Any,
    feature: str,
    log_label: str,
) -> tuple[Any, str] | None:
    """Select a provider from registry. Returns (state, request_id) or None."""
    state = registry.get_provider(feature=feature)
    if state is None:
        logger.warning('llm_no_provider_available', label=log_label)
        return None
    return state, uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Core invoke with circuit breaker
# ---------------------------------------------------------------------------


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
    selected = _select_provider(registry, feature or log_label, log_label)
    if selected is None:
        return None

    state, request_id = selected
    start = time.monotonic()

    if not await state.circuit.allow_request():
        logger.warning('llm_circuit_blocked', label=log_label, provider=state.config.name)
        return await _try_next_provider(
            messages, registry, state.config.name, request_id, log_label,
            start_time=start, user_id=user_id, book_id=book_id,
        )

    provider_name = state.config.name
    model_used = state.config.default_model
    try:
        llm = get_llm(provider=provider_name)
        response = await _invoke_with_retry(llm, messages, log_label)
        await _record_success(
            state=state, provider_name=provider_name, registry=registry,
            request_id=request_id, model_used=model_used, log_label=log_label,
            start=start, response=response, user_id=user_id, book_id=book_id,
        )
        return response
    except Exception as exc:
        return await _handle_invoke_failure(
            state=state, provider_name=provider_name, registry=registry,
            request_id=request_id, model_used=model_used, log_label=log_label,
            start=start, exc=exc, messages=messages,
            user_id=user_id, book_id=book_id,
        )
