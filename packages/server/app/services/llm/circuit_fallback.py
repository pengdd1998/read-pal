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
    _settle_attempt_tokens,
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
    temperature: float | None = None,
    max_tokens: int | None = None,
    prompt_version: str | None = None,
    lang: str | None = None,
    pre_charge: int = 0,
    token_limit: int = 0,
) -> Any:
    """Record failure, log it, and attempt fallback providers.

    P0.2: does NOT refund the pre-charge here. The pre-charge is held across
    the fallback chain so the user pays for exactly one successful attempt.
    Each fallback's success settles with its own actual usage; if all
    fallbacks fail, we refund at the very end.
    """
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
        prompt_version=prompt_version,
        lang=lang,
    )
    response = await _try_next_provider(
        messages, registry, provider_name, request_id, log_label,
        start_time=start,
        user_id=user_id, book_id=book_id,
        temperature=temperature, max_tokens=max_tokens,
        prompt_version=prompt_version, lang=lang,
        pre_charge=pre_charge, token_limit=token_limit,
    )
    if response is None:
        fb_model = state.config.fallback_model
        if fb_model:
            response = await _try_same_provider_fallback(
                messages, state, fb_model, request_id, log_label,
                start_time=start,
                user_id=user_id, book_id=book_id,
                temperature=temperature, max_tokens=max_tokens,
                prompt_version=prompt_version, lang=lang,
                pre_charge=pre_charge, token_limit=token_limit,
            )
    return response


async def _invoke_with_circuit(  # noqa: C901, PLR0915 — fallback-chain orchestration; one failure flow per provider hop, splitting would obscure the chain
    messages: list[BaseMessage],
    *,
    log_label: str = 'LLM',
    user_id: str | None = None,
    book_id: str | None = None,
    feature: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    prompt_version: str | None = None,
    lang: str | None = None,
    structured_output: bool = False,
) -> Any:
    """Low-level invoke with per-provider circuit breaker + multi-provider fallback.

    ``temperature`` / ``max_tokens`` are passed to ``pool.get_llm`` so per-template
    overrides reach the vendor. ``prompt_version`` / ``lang`` are recorded in the
    observability trace. All optional — when None, pool defaults apply.

    P3.2: pre-charges the daily TOKEN budget (if enabled) using a chars/4
    estimate of input messages + ``max_tokens`` as reserved output. Settles
    post-call with actual usage from ``response.usage_metadata``.

    P0.2: the pre-charge is held across the fallback chain. Previously the
    primary-failure path refunded immediately, which meant fallback tokens
    went entirely unbilled — and under poor networks (idempotent retry after
    primary emitted partial output) the user could be triple-charged. Now:
    primary failure holds the pre-charge, each fallback settles with its own
    usage on success, and only when every attempt fails do we refund.
    """
    from app.services.llm.pool import get_llm
    from app.services.llm.registry import get_registry
    from app.config import get_settings
    from app.middleware.daily_llm_budget import (
        _get_budget, estimate_input_tokens,
    )

    registry = get_registry()
    selected = _select_provider(registry, feature or log_label, log_label)
    if selected is None:
        return None

    state, request_id = selected
    start = time.monotonic()
    primary_attempt_id = uuid.uuid4().hex[:12]

    if not await state.circuit.allow_request():
        logger.warning(
            'llm_circuit_blocked', label=log_label,
            provider=state.config.name,
            provider_attempt_id=primary_attempt_id,
        )
        return await _try_next_provider(
            messages, registry, state.config.name, request_id, log_label,
            start_time=start, user_id=user_id, book_id=book_id,
            temperature=temperature, max_tokens=max_tokens,
            prompt_version=prompt_version, lang=lang,
        )

    provider_name = state.config.name
    model_used = state.config.default_model

    # Resolve pool kwargs: explicit values > defaults
    pool_kwargs: dict[str, Any] = {}
    if temperature is not None:
        pool_kwargs['temperature'] = temperature
    if max_tokens is not None:
        pool_kwargs['max_tokens'] = max_tokens

    # Pre-charge the daily token budget (no-op when llm_daily_token_budget == 0).
    settings = get_settings()
    token_limit = settings.llm_daily_token_budget
    pre_charge = 0
    if token_limit > 0 and user_id:
        reserved_output = max_tokens if max_tokens is not None else 1000
        pre_charge = estimate_input_tokens(messages) + reserved_output
        budget = _get_budget()
        allowed, _, _ = await budget.check_and_charge_tokens(
            user_id, pre_charge, token_limit,
        )
        if not allowed:
            logger.warning(
                'llm_token_budget_blocked',
                label=log_label, user_id=user_id,
                pre_charge=pre_charge, limit=token_limit,
            )
            from fastapi import HTTPException, status as http_status
            raise HTTPException(
                status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    'code': 'DAILY_TOKEN_BUDGET_EXCEEDED',
                    'message': 'Daily AI token limit reached. Try again tomorrow.',
                },
                headers={'Retry-After': '3600'},
            )

    # B2: provider-level TPM check. Fail-fast with Retry-After (computed
    # from the 60s window remaining) so the caller can either retry or
    # surface the cap to the user. Only active when tpm_enforced=True —
    # providers default to max_tpm=0 (unlimited) so this branch is inert
    # unless ops explicitly opted in.
    if settings.tpm_enforced and state.config.max_tpm > 0:
        estimate = pre_charge or (estimate_input_tokens(messages) + 1000)
        if not state.tpm_available(estimate):
            retry_after = max(1, int(state.tpm_window_remaining_seconds()))
            logger.warning(
                'llm_tpm_blocked',
                label=log_label, provider=provider_name,
                estimated=estimate, current=state.token_count,
                cap=state.config.max_tpm,
            )
            from fastapi import HTTPException, status as http_status
            raise HTTPException(
                status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    'code': 'TPM_BUDGET_EXCEEDED',
                    'message': 'AI provider is at capacity. Try again shortly.',
                    'provider': provider_name,
                },
                headers={'Retry-After': str(retry_after)},
            )

    try:
        llm = get_llm(provider=provider_name, structured_output=structured_output, **pool_kwargs)
        response = await _invoke_with_retry(llm, messages, log_label)
        await _record_success(
            state=state, provider_name=provider_name, registry=registry,
            request_id=request_id, model_used=model_used, log_label=log_label,
            start=start, response=response, user_id=user_id, book_id=book_id,
            prompt_version=prompt_version, lang=lang,
            provider_attempt_id=primary_attempt_id,
        )
        # Settle token budget with actual usage.
        if token_limit > 0 and user_id and pre_charge > 0:
            from app.services.llm.observability import _extract_usage
            actual_usage = _extract_usage(response).get('total_tokens', pre_charge)
            await _get_budget().settle_tokens(user_id, pre_charge, actual_usage)
        return response
    except Exception as exc:
        # P0.2: don't refund yet — try fallback first. The pre-charge is
        # held so a successful fallback can settle with its own usage. We
        # only refund if the entire fallback chain also fails (response is
        # None after _handle_invoke_failure).
        response = await _handle_invoke_failure(
            state=state, provider_name=provider_name, registry=registry,
            request_id=request_id, model_used=model_used, log_label=log_label,
            start=start, exc=exc, messages=messages,
            user_id=user_id, book_id=book_id,
            temperature=temperature, max_tokens=max_tokens,
            prompt_version=prompt_version, lang=lang,
            pre_charge=pre_charge, token_limit=token_limit,
        )
        if response is None and pre_charge > 0:
            # All attempts failed — refund the held pre-charge.
            await _settle_attempt_tokens(
                user_id=user_id, pre_charge=pre_charge, actual_usage=0,
                token_limit=token_limit, log_label=log_label,
                request_id=request_id, provider_attempt_id=primary_attempt_id,
            )
        return response
