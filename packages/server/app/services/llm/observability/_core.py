"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog


logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Cost estimation constants
# ---------------------------------------------------------------------------

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

# Heuristic: chars per token for estimation when response_metadata is absent
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


def _current_http_request_id() -> str | None:
    """Best-effort read of the HTTP request id bound by request_log middleware.

    0018 added an ``http_request_id`` column for HTTP-LLM correlation but no
    writer ever filled it. The middleware binds ``request_id`` into structlog
    contextvars at the start of every HTTP request
    (``app/middleware/request_log.py``), so reading it here correlates each
    LLM call to its access-log entry without threading the id through every
    call site. Returns None for non-HTTP contexts (eval runs, background
    tasks) — the column is nullable for exactly that reason.
    """
    try:
        return structlog.contextvars.get_contextvars().get('request_id')
    except Exception:  # noqa: BLE001 — correlation is best-effort
        return None


def _build_trace_dict(
    *,
    request_id: str,
    model: str,
    label: str,
    latency_ms: int,
    usage: dict[str, int],
    cost: float,
    success: bool,
    fallback_used: bool,
    error_message: str | None,
    provider: str | None,
    prompt_version: str | None = None,
    ttft_ms: int | None = None,
    finish_reason: str | None = None,
    lang: str | None = None,
    provider_attempt_id: str | None = None,
    error_type: str | None = None,
    cache_hit: bool = False,
    user_id: str | None = None,
    book_id: str | None = None,
    http_request_id: str | None = None,
) -> dict[str, Any]:
    """Build the shared trace dict used for both logging and DB persistence.

    ``provider_attempt_id`` is logged but not persisted (no DB column) — it
    correlates per-attempt vendor-side calls to the same logical request_id
    during fallback chains so we can attribute partial-emit failures during
    incident triage (P0.2).

    P4.2: ``error_type`` and ``cache_hit`` ARE persisted (new columns in
    migration 0022). ``error_type`` is the categorical classifier output
    of ``_classify_error``; ``cache_hit`` distinguishes cache-served
    responses from fresh LLM calls in cost/latency analytics.

    Engineering-upgrade follow-up (2026-09-05, migration 0029):
    ``user_id`` / ``book_id`` are persisted too — they previously reached
    only stdout logs, leaving badcase triage unable to query calls by user.
    ``http_request_id`` (column existed since 0018) is now actually filled.
    """
    return {
        'request_id': request_id,
        'model': model,
        'label': label,
        'latency_ms': latency_ms,
        'prompt_tokens': usage.get('prompt_tokens', 0),
        'completion_tokens': usage.get('completion_tokens', 0),
        'total_tokens': usage.get('total_tokens', 0),
        'estimated_cost_usd': cost,
        'success': success,
        'fallback_used': fallback_used,
        'error_message': error_message,
        'provider': provider,
        'prompt_version': prompt_version,
        'ttft_ms': ttft_ms,
        'finish_reason': finish_reason,
        'lang': lang,
        'cache_hit': cache_hit,
        'error_type': error_type,
        'user_id': user_id,
        'book_id': book_id,
        'http_request_id': http_request_id,
    }


def _log_call(
    *,
    request_id: str,
    model: str,
    label: str,
    latency_ms: int,
    usage: dict[str, int],
    success: bool,
    fallback_used: bool = False,
    error_message: str | None = None,
    error_type: str | None = None,
    exc: Exception | None = None,
    provider: str | None = None,
    user_id: str | None = None,
    book_id: str | None = None,
    prompt_version: str | None = None,
    ttft_ms: int | None = None,
    finish_reason: str | None = None,
    lang: str | None = None,
    provider_attempt_id: str | None = None,
    cache_hit: bool = False,
    params: dict[str, Any] | None = None,
) -> None:
    """Structured log for every LLM call — console + DB persistence.

    ``provider_attempt_id`` is emitted into the structlog record (visible in
    log streams) but is NOT added to the persisted trace dict — keeping the
    DB schema stable. Each retry / fallback attempt stamps a fresh id so a
    logical request_id can map to N vendor-side calls during triage.

    P4.2: ``error_type`` is derived from ``exc`` (preferred) or
    ``error_message`` (fallback). Pass ``exc=`` through from the call site
    so the classifier can use isinstance() checks — substring matching on
    the message is brittle against vendor wording changes.
    """
    # Resolve error_type: explicit kwarg wins, then classify from exc, then
    # classify from error_message. The explicit-kwarg path lets callers
    # that already know their category (e.g. 'circuit_open' from the
    # circuit-breaker rejection site) skip re-classification.
    if error_type is None and (exc is not None or error_message):
        error_type = _classify_error(exc, error_message)

    cost = _estimate_cost(
        model,
        usage.get('prompt_tokens', 0),
        usage.get('completion_tokens', 0),
    )
    trace = _build_trace_dict(
        request_id=request_id,
        model=model,
        label=label,
        latency_ms=latency_ms,
        usage=usage,
        cost=cost,
        success=success,
        fallback_used=fallback_used,
        error_message=error_message,
        provider=provider,
        prompt_version=prompt_version,
        ttft_ms=ttft_ms,
        finish_reason=finish_reason,
        lang=lang,
        error_type=error_type,
        cache_hit=cache_hit,
        user_id=user_id,
        book_id=book_id,
        http_request_id=_current_http_request_id(),
    )
    logger.info(
        'llm_call',
        **trace,  # user_id/book_id/http_request_id ride along in the dict now
        estimated_cost=round(cost, 6),
        fallback=fallback_used,
        provider_attempt_id=provider_attempt_id,
        params=params,
    )
    # Engineering-upgrade follow-up: ``params`` (temperature/max_tokens) has no
    # DB column — it reaches the JSONL channel only, closing the schema gap
    # against the workflow's stage-1 log contract without a migration.
    jsonl_record = dict(trace)
    if params:
        jsonl_record['params'] = params
    from app.services.llm.observability import _jsonl_sink, _trace_writer
    _jsonl_sink.write(jsonl_record)
    _trace_writer.add(trace)


def _log_cache_hit(
    *,
    request_id: str,
    label: str,
    prompt_version: str | None,
    user_id: str | None = None,
    book_id: str | None = None,
    lang: str | None = None,
    model: str = 'cached',
    provider: str | None = None,
    latency_ms: int = 0,
) -> None:
    """Emit a trace row for a cache-served response.

    P4.2: previously cache hits short-circuited the LLM call entirely and
    produced zero trace output — making cache hit rate uncomputable and
    hiding why a request appeared "free" in cost dashboards. This helper
    writes a row with ``cache_hit=True``, ``tokens=0``, ``cost=0``,
    ``success=True`` so cached and fresh responses live in the same trace
    surface. ``model='cached'`` is the marker for downstream queries that
    want to exclude cache rows from per-model analytics.
    """
    trace = _build_trace_dict(
        request_id=request_id,
        model=model,
        label=label,
        latency_ms=latency_ms,
        usage={},
        cost=0.0,
        success=True,
        fallback_used=False,
        error_message=None,
        provider=provider,
        prompt_version=prompt_version,
        ttft_ms=None,
        finish_reason='cache',
        lang=lang,
        error_type=None,
        cache_hit=True,
        user_id=user_id,
        book_id=book_id,
        http_request_id=_current_http_request_id(),
    )
    logger.info(
        'llm_cache_hit',
        **trace,  # user_id/book_id/http_request_id ride along in the dict now
        estimated_cost=0.0,
        fallback=False,
    )
    from app.services.llm.observability import _jsonl_sink, _trace_writer
    _jsonl_sink.write(dict(trace))
    _trace_writer.add(trace)


# ---------------------------------------------------------------------------
