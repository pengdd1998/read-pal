"""Safe LLM invoke — circuit breaker, multi-provider fallback, caching, JSON parsing.

Public API: ``safe_llm_call`` and ``safe_llm_invoke``.
Internal helpers are re-exported from sub-modules for backward compatibility.
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from langchain_core.messages import BaseMessage

from app.services.llm.circuit_fallback import (
    _handle_invoke_failure,
    _invoke_with_circuit,
    _select_provider,
)
from app.services.llm.provider_fallback import (
    _invoke_and_record_fallback,
    _record_failure,
    _record_success,
    _try_next_provider,
    _try_same_provider_fallback,
)
from app.services.llm.retry import (
    _RATE_LIMIT_BACKOFFS,
    _invoke_with_retry,
    _is_rate_limited,
)
from app.services.llm.text import _strip_markdown_fences, _validate_parsed

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Cache sentinel
# ---------------------------------------------------------------------------


class _MissingSentinel:
    pass


_MISS = _MissingSentinel()


async def _check_json_cache(
    key: str,
    schema_class: type | None,
    log_label: str,
) -> Any:
    """Return parsed JSON from cache if available, or sentinel _MISS."""
    from app.services.llm.cache import _cache_get

    if not key:
        return _MISS
    cached = await _cache_get(key)
    if cached is None:
        return _MISS
    try:
        parsed = json.loads(cached)
    except json.JSONDecodeError:
        logger.debug('safe_invoke.cache_corrupt_json', key=key[:16] if key else None)
        return _MISS
    if schema_class is not None:
        # Treat a cached-but-schema-invalid entry as a miss so the next call
        # re-fetches fresh output instead of serving a structurally-wrong value.
        try:
            parsed = schema_class.model_validate(parsed).model_dump()
        except (ValueError, TypeError) as exc:
            logger.warning(
                'safe_invoke.cache_schema_invalid',
                label=log_label, error=str(exc)[:200],
            )
            return _MISS
    return parsed


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
    from app.services.llm.cache import _cache_key, _cache_set

    effective_feature = feature or log_label
    key = _cache_key(messages, log_label, user_id=user_id) if use_cache else ''

    cached = await _check_json_cache(key, schema_class, log_label)
    if not isinstance(cached, _MissingSentinel):
        return cached

    response = await _invoke_with_circuit(
        messages, log_label=log_label,
        user_id=user_id, book_id=book_id,
        feature=effective_feature,
    )
    if response is None:
        return fallback

    content = _strip_markdown_fences(response.content.strip())
    if key:
        await _cache_set(key, content)

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning('llm_json_parse_failed', label=log_label, content_preview=content[:200])
        return fallback

    if schema_class is not None:
        parsed = _validate_parsed(parsed, schema_class, log_label, fallback)
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
    key = _cache_key(messages, log_label, user_id=user_id) if use_cache else ''

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
