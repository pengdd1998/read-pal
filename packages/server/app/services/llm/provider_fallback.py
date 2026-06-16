"""Provider fallback strategies — recording, next-provider, and same-provider fallback."""

from __future__ import annotations

import time
import uuid
from typing import Any

import structlog
from langchain_core.messages import BaseMessage

from app.services.llm.retry import _invoke_with_retry

logger = structlog.get_logger('read-pal.llm')


def _new_attempt_id() -> str:
    """Fresh provider_attempt_id for vendor-side correlation per attempt."""
    return uuid.uuid4().hex[:12]


# ---------------------------------------------------------------------------
# Token budget settlement helpers (P0.2)
# ---------------------------------------------------------------------------


async def _settle_attempt_tokens(
    *,
    user_id: str | None,
    pre_charge: int,
    actual_usage: int,
    token_limit: int,
    log_label: str,
    request_id: str,
    provider_attempt_id: str,
) -> None:
    """Settle the daily token budget for one logical request.

    The pre-charge is held across the primary + fallback chain (NOT refunded
    per-attempt); each attempt settles with its own actual usage so the user
    pays exactly once for whichever attempt succeeded. When all attempts
    fail the caller passes ``actual_usage=0`` to refund.
    """
    if token_limit <= 0 or not user_id or pre_charge <= 0:
        return
    from app.middleware.daily_llm_budget import _get_budget
    try:
        await _get_budget().settle_tokens(user_id, pre_charge, actual_usage)
    except Exception as exc:  # noqa: BLE001 — settle is best-effort
        logger.warning(
            'llm_token_settle_failed',
            label=log_label, request_id=request_id,
            provider_attempt_id=provider_attempt_id,
            error=str(exc)[:200],
        )


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
    prompt_version: str | None = None,
    lang: str | None = None,
    provider_attempt_id: str | None = None,
) -> None:
    """Record a successful LLM invocation: metrics + observability log."""
    from app.services.llm.observability import (
        _extract_finish_reason,
        _extract_usage,
        _log_call,
    )

    latency_ms = int((time.monotonic() - start) * 1000)
    await state.circuit.record_success()
    registry.record_latency(provider_name, latency_ms, True)
    usage = _extract_usage(response)
    finish_reason = _extract_finish_reason(response)
    # B2: account actual usage against the provider's TPM window. Post-call
    # accounting (no pre-charge) — the simpler design trades a one-request
    # overshoot window for not having to thread pre_charge through 4 helper
    # layers. Per-user daily token budget still catches single-request
    # bursts at the user level.
    actual_tokens = usage.get('total_tokens', 0)
    if actual_tokens > 0:
        state.increment_tpm(actual_tokens)
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
        prompt_version=prompt_version,
        lang=lang,
        provider_attempt_id=provider_attempt_id,
        finish_reason=finish_reason,
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
    prompt_version: str | None = None,
    lang: str | None = None,
    provider_attempt_id: str | None = None,
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
        provider_attempt_id=provider_attempt_id,
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
        exc=exc,
        user_id=user_id,
        book_id=book_id,
        prompt_version=prompt_version,
        lang=lang,
        provider_attempt_id=provider_attempt_id,
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
    prompt_version: str | None = None,
    lang: str | None = None,
    provider_attempt_id: str | None = None,
    pre_charge: int = 0,
    token_limit: int = 0,
) -> Any:
    """Try LLM invoke with retry, record success/failure metrics. Returns response or None.

    P0.2: on success, settles the pre-charge with the fallback's actual usage
    so the user pays for exactly one attempt's tokens. The caller passes the
    pre-charge amount from the logical-request entry; if zero (budget
    disabled), settlement is a no-op.
    """
    from app.services.llm.observability import (
        _extract_finish_reason,
        _extract_usage,
        _log_call,
    )

    fb_start = time.monotonic()
    try:
        response = await _invoke_with_retry(llm, messages, log_label)
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        await state.circuit.record_success()
        if registry:
            registry.record_latency(provider_name, latency_ms, True)
        actual_usage = _extract_usage(response)
        finish_reason = _extract_finish_reason(response)
        # B2: account actual usage against the fallback provider's TPM.
        actual_tokens = actual_usage.get('total_tokens', 0)
        if actual_tokens > 0:
            state.increment_tpm(actual_tokens)
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage=actual_usage,
            success=True, fallback_used=True, provider=provider_name,
            user_id=user_id, book_id=book_id,
            prompt_version=prompt_version, lang=lang,
            provider_attempt_id=provider_attempt_id,
            finish_reason=finish_reason,
        )
        await _settle_attempt_tokens(
            user_id=user_id, pre_charge=pre_charge,
            actual_usage=actual_usage.get('total_tokens', pre_charge),
            token_limit=token_limit, log_label=log_label,
            request_id=request_id, provider_attempt_id=provider_attempt_id or '',
        )
        return response
    except Exception as exc:
        latency_ms = int((time.monotonic() - fb_start) * 1000)
        logger.error(
            'llm_fallback_failed', label=log_label,
            provider=provider_name, error=str(exc)[:300],
            provider_attempt_id=provider_attempt_id,
        )
        await state.circuit.record_failure()
        if registry:
            registry.record_latency(provider_name, latency_ms, False)
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage={}, success=False,
            fallback_used=True, provider=provider_name,
            error_message=str(exc)[:500],
            exc=exc,
            user_id=user_id, book_id=book_id,
            prompt_version=prompt_version, lang=lang,
            provider_attempt_id=provider_attempt_id,
        )
        # Settlement is the caller's responsibility on failure (so the chain
        # can refund only when ALL attempts have failed).
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
    temperature: float | None = None,
    max_tokens: int | None = None,
    prompt_version: str | None = None,
    lang: str | None = None,
    pre_charge: int = 0,
    token_limit: int = 0,
    _visited: set[str] | None = None,
) -> Any:
    """Try the next available provider after the failed one.

    P1.2: tracks visited providers via ``_visited`` to guarantee termination.
    Even with the registry excluding HALF_OPEN-with-probe providers from
    ``_available_providers``, this guard prevents infinite recursion if a
    future change re-introduces a cycle (e.g., probe clears between calls).
    """
    from app.services.llm.pool import get_llm

    if _visited is None:
        _visited = {failed_provider}
    elif failed_provider in _visited:
        # Already tried this provider in this cascade — give up.
        logger.warning(
            'llm_fallback_cycle_detected',
            label=log_label, failed_provider=failed_provider,
            visited=sorted(_visited),
        )
        return None
    else:
        _visited.add(failed_provider)

    next_state = registry.next_provider_after(failed_provider)
    if next_state is None:
        logger.error('llm_all_providers_exhausted', label=log_label)
        return None

    provider_name = next_state.config.name
    model_used = next_state.config.default_model

    if not await next_state.circuit.allow_request():
        if provider_name not in _visited:
            return await _try_next_provider(
                messages, registry, provider_name, request_id, log_label,
                start_time=start_time, user_id=user_id, book_id=book_id,
                temperature=temperature, max_tokens=max_tokens,
                prompt_version=prompt_version, lang=lang,
                pre_charge=pre_charge, token_limit=token_limit,
                _visited=_visited,
            )
        return None

    attempt_id = _new_attempt_id()
    logger.info(
        'llm_next_provider_retry', label=log_label,
        provider=provider_name, model=model_used,
        provider_attempt_id=attempt_id,
    )
    pool_kwargs: dict[str, Any] = {}
    if temperature is not None:
        pool_kwargs['temperature'] = temperature
    if max_tokens is not None:
        pool_kwargs['max_tokens'] = max_tokens
    llm = get_llm(provider=provider_name, **pool_kwargs)
    return await _invoke_and_record_fallback(
        messages, llm, next_state, provider_name, model_used,
        request_id, log_label, registry,
        user_id=user_id, book_id=book_id,
        prompt_version=prompt_version, lang=lang,
        provider_attempt_id=attempt_id,
        pre_charge=pre_charge, token_limit=token_limit,
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
    temperature: float | None = None,
    max_tokens: int | None = None,
    prompt_version: str | None = None,
    lang: str | None = None,
    pre_charge: int = 0,
    token_limit: int = 0,
) -> Any:
    """Try the fallback model from the same provider (legacy behavior)."""
    from app.services.llm.pool import get_llm

    provider_name = state.config.name
    attempt_id = _new_attempt_id()
    logger.info(
        'llm_same_provider_fallback', label=log_label,
        provider=provider_name, fallback_model=fallback_model,
        provider_attempt_id=attempt_id,
    )
    pool_kwargs: dict[str, Any] = {'model': fallback_model}
    if temperature is not None:
        pool_kwargs['temperature'] = temperature
    if max_tokens is not None:
        pool_kwargs['max_tokens'] = max_tokens
    llm = get_llm(provider=provider_name, **pool_kwargs)
    return await _invoke_and_record_fallback(
        messages, llm, state, provider_name, fallback_model,
        request_id, log_label,
        user_id=user_id, book_id=book_id,
        prompt_version=prompt_version, lang=lang,
        provider_attempt_id=attempt_id,
        pre_charge=pre_charge, token_limit=token_limit,
    )
