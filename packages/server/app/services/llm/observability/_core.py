"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

from typing import Any

import structlog


logger = structlog.get_logger('read-pal.llm')

from app.services.llm.observability._usage import (  # noqa: E402,F401
    _CHARS_PER_TOKEN,
    _ERROR_CATEGORIES,
    _classify_error,
    _estimate_cost,
    _estimate_tokens_from_chars,
    _extract_finish_reason,
    _extract_usage,
)

# ---------------------------------------------------------------------------
# Cost estimation constants
# ---------------------------------------------------------------------------


# Heuristic: chars per token for estimation when response_metadata is absent

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
