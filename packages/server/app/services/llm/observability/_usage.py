"""Usage/cost estimation + error classification (split from _core, M3.2)."""

from __future__ import annotations

import asyncio
from typing import Any

_COST_PER_1K: dict[str, dict[str, float]] = {
    # GLM / Zhipu (free tier)
    'glm-4.7-flash': {'input': 0.0, 'output': 0.0},
    'glm-4-flash': {'input': 0.0, 'output': 0.0},
    'glm-4': {'input': 0.00007, 'output': 0.00007},
    # DeepSeek
    'deepseek-chat': {'input': 0.00007, 'output': 0.00027},
    'deepseek-reasoner': {'input': 0.00014, 'output': 0.00219},
    # Alibaba Qwen
    'qwen-turbo': {'input': 0.000033, 'output': 0.00013},
    # OpenAI
    'gpt-4o-mini': {'input': 0.00015, 'output': 0.0006},
    'gpt-4.1-nano': {'input': 0.0001, 'output': 0.0004},
    'gpt-4.1-mini': {'input': 0.0004, 'output': 0.0016},
    'gpt-4o': {'input': 0.0025, 'output': 0.01},
}


_CHARS_PER_TOKEN = 4


# P4.2: stable error categories for the trace ``error_type`` column. Adding
# a new category here is a backwards-compatible change (NULL/unknown stays
# valid for older rows). Dashboards/queries should treat unknown categories
# as "other" rather than erroring — they will appear as new vendors/models
# introduce novel failure shapes.
_ERROR_CATEGORIES = (
    'rate_limit',
    'network',
    'timeout',
    'auth',
    'server_error',
    'content_filter',
    'cancelled',
    'parse_failure',
    'circuit_open',
    'budget_exceeded',
    'unknown',
)


def _classify_error(  # noqa: C901 — branch structure is the domain (classification/prompt matrix); splitting would obscure it
    exc: Exception | None,
    error_message: str | None,
) -> str | None:
    """Map an exception (or its message) to a stable error_type category.

    Returns ``None`` when both inputs are absent (success path).

    Type-based detection takes precedence over substring matching: it's
    stable across error-message wording changes from the vendor. Substring
    matching on ``error_message`` is a fallback for paths where the
    original exception was already stringified (e.g. logs from the
    fallback chain that pass only the message).

    ``unknown`` is returned rather than ``None`` for genuinely-unmatched
    failures — dashboards can group these to spot new vendor failure
    modes that warrant a new category.
    """
    if exc is None and not error_message:
        return None

    # Type-based detection (authoritative when we have an exception).
    if exc is not None:
        # Imported lazily so this module stays import-safe when openai SDK
        # is upgraded or removed — ``_classify_error`` is a side-helper.
        try:
            from openai import (
                APIConnectionError,
                APITimeoutError,
                AuthenticationError,
                BadRequestError,
                ConflictError,
                InternalServerError,
                RateLimitError,
            )
        except ImportError:  # pragma: no cover — openai is a hard dep
            return 'unknown'
        if isinstance(exc, RateLimitError):
            return 'rate_limit'
        if isinstance(exc, APITimeoutError):
            return 'timeout'
        if isinstance(exc, APIConnectionError):
            return 'network'
        if isinstance(exc, AuthenticationError):
            return 'auth'
        if isinstance(exc, InternalServerError):
            return 'server_error'
        if isinstance(exc, ConflictError):
            # 409s from openai are typically content-policy / safety hits.
            return 'content_filter'
        if isinstance(exc, BadRequestError):
            # Schema/argument errors. Worth distinguishing from server
            # faults because they're caller bugs, not vendor faults.
            return 'parse_failure'
        if isinstance(exc, asyncio.CancelledError):
            return 'cancelled'
        if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
            return 'timeout'
        if isinstance(exc, ConnectionError):
            return 'network'

    # Substring fallback — for the fallback chain paths that pass only
    # the message string, and for non-openai exceptions.
    msg = (error_message or str(exc) if exc else error_message or '').lower()
    if not msg:
        return 'unknown'
    # '1302' = GLM account-level sustained-quota hit (see retry.py).
    if 'rate limit' in msg or '429' in msg or 'quota' in msg or '1302' in msg:
        return 'rate_limit'
    if 'timed out' in msg or 'timeout' in msg:
        return 'timeout'
    if 'connection' in msg or 'unreachable' in msg or 'network' in msg:
        return 'network'
    if 'unauthorized' in msg or 'api key' in msg or 'auth' in msg:
        return 'auth'
    if 'content_filter' in msg or 'content filter' in msg or 'safety' in msg:
        return 'content_filter'
    if 'circuit' in msg and 'open' in msg:
        return 'circuit_open'
    if 'budget' in msg and ('exceed' in msg or 'limit' in msg):
        return 'budget_exceeded'
    if 'cancel' in msg:
        return 'cancelled'
    if 'parse' in msg or 'json' in msg or 'schema' in msg:
        return 'parse_failure'
    if any(code in msg for code in ('500', '502', '503', '504')) or 'server error' in msg:
        return 'server_error'
    return 'unknown'


def _estimate_tokens_from_chars(text: str) -> int:
    """Estimate token count from character length."""
    return max(len(text) // _CHARS_PER_TOKEN, 1)


def _extract_usage(response: Any) -> dict[str, int]:
    """Extract token usage from LLM response metadata."""
    usage: dict[str, int] = {}
    meta = getattr(response, 'response_metadata', {}) or {}
    token_usage = meta.get('token_usage', {})
    if token_usage:
        usage['prompt_tokens'] = token_usage.get('prompt_tokens', 0)
        usage['completion_tokens'] = token_usage.get('completion_tokens', 0)
        usage['total_tokens'] = token_usage.get('total_tokens', 0)
    if not usage.get('total_tokens'):
        content = getattr(response, 'content', '') or ''
        usage['completion_tokens'] = _estimate_tokens_from_chars(content)
        usage['total_tokens'] = usage['completion_tokens']
    return usage


def _extract_finish_reason(response: Any) -> str | None:
    """Extract finish_reason from LLM response metadata.

    Verification-gap fix (A1): ``_log_call`` accepts ``finish_reason`` and the
    DB column exists, but call sites were never passing it — every fresh LLM
    call logged ``finish_reason=None`` while only cache hits populated it
    (``finish_reason='cache'``). Langchain ``ChatOpenAI`` exposes the vendor
    stop reason (``stop`` / ``length`` / ``tool_calls`` / ``content_filter``)
    at ``response.response_metadata['finish_reason']``; this helper mirrors
    ``_extract_usage``'s defensive pattern.
    """
    meta = getattr(response, 'response_metadata', {}) or {}
    finish_reason = meta.get('finish_reason')
    if finish_reason and isinstance(finish_reason, str):
        return finish_reason
    return None


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for a single call."""
    rates = _COST_PER_1K.get(model, {'input': 0.0001, 'output': 0.0001})
    return (
        prompt_tokens / 1000 * rates['input']
        + completion_tokens / 1000 * rates['output']
    )

