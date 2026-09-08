"""LLM observability — structured call logging, token estimation, cost tracking."""

from __future__ import annotations

import asyncio
import os
import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog

from app.config import get_settings
from app.utils.db import db_error_guard

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
    _jsonl_sink.write(dict(trace))
    _trace_writer.add(trace)


# ---------------------------------------------------------------------------
# JSONL sink — append-only local trace channel (engineering-upgrade B1)
# ---------------------------------------------------------------------------


class _JSONLSink:
    """Append-only JSONL sink for LLM call traces.

    Gated by ``Settings.llm_trace_jsonl_path`` (empty = off). Independent of
    ``llm_log_enabled`` so ops can run the file channel even when DB
    persistence is disabled (e.g. on a machine without the trace table).

    24h-review R4: records buffer in memory and flush in ONE open/append/
    close per batch (the old per-call sync open ran on the event loop for
    every LLM call), with size-based rotation at ROTATE_BYTES so the file
    can't grow unbounded. Failures log a warning and never propagate:
    observability must not take down the call path.
    """

    ROTATE_BYTES = 50 * 1024 * 1024  # 50MB → .1 suffix, previous copy dropped
    FLUSH_EVERY = 64  # records per batched write

    def __init__(self) -> None:
        self._buf: list[str] = []

    def write(self, record: dict[str, Any]) -> None:
        try:
            path = get_settings().llm_trace_jsonl_path
        except Exception:  # noqa: BLE001 — settings read must never raise here
            return
        if not path:
            return
        record = dict(record)
        record.setdefault('ts', datetime.now(UTC).isoformat())
        self._buf.append(json.dumps(record, ensure_ascii=False, default=str))
        if len(self._buf) >= self.FLUSH_EVERY:
            self.flush(path)

    def flush(self, path: str | None = None) -> int:
        """Write buffered records; returns how many were written."""
        if not self._buf:
            return 0
        try:
            path = path or get_settings().llm_trace_jsonl_path
        except Exception:  # noqa: BLE001
            return 0
        if not path:
            self._buf.clear()  # sink disabled mid-flight: drop quietly
            return 0
        batch, self._buf = self._buf, []
        try:
            self._rotate_if_large(path)
            with open(path, 'a', encoding='utf-8') as fh:
                fh.write('\n'.join(batch) + '\n')
            return len(batch)
        except OSError:
            logger.warning('llm_trace_jsonl_write_failed', path=path, records=len(batch))
            return 0

    def _rotate_if_large(self, path: str) -> None:
        try:
            if os.path.exists(path) and os.path.getsize(path) >= self.ROTATE_BYTES:
                os.replace(path, f'{path}.1')  # keep exactly one prior generation
        except OSError:
            pass  # rotation is best-effort; the append still runs


_jsonl_sink = _JSONLSink()


def capture_llm_content(
    *,
    request_id: str,
    label: str,
    model: str,
    prompt_version: str | None,
    messages: list[Any],
    output_text: str,
    user_id: str | None = None,
    book_id: str | None = None,
) -> None:
    """Opt-in prompt/output preview capture for badcase replay (B4).

    Writes an ``event='llm_content'`` record to the JSONL sink ONLY — never
    to the DB, never to structlog (content must not land in log streams).
    Gated by ``Settings.llm_trace_capture_content`` (default False) because
    previews can contain user-authored text; truncation is enforced by
    ``llm_trace_capture_chars``.
    """
    try:
        settings = get_settings()
    except Exception:  # noqa: BLE001 — settings read must never raise here
        return
    if not settings.llm_trace_capture_content:
        return
    cap = max(int(settings.llm_trace_capture_chars), 0)
    prompt_preview = '\n'.join(
        f'[{getattr(m, "type", "?")}] {getattr(m, "content", "")}'
        for m in messages
    )[:cap]
    _jsonl_sink.write({
        'event': 'llm_content',
        'request_id': request_id,
        'label': label,
        'model': model,
        'prompt_version': prompt_version,
        'user_id': user_id,
        'book_id': book_id,
        'prompt_preview': prompt_preview,
        'output_preview': (output_text or '')[:cap],
    })


# ---------------------------------------------------------------------------
# Trace writer — async buffered persistence to PostgreSQL
# ---------------------------------------------------------------------------


class _TraceWriter:
    """Buffered, fire-and-forget writer for LLM call traces."""

    MAX_BUFFER = 50
    FLUSH_INTERVAL = 5.0
    # Engineering-upgrade follow-up: retention prune check cadence. Actual
    # deletion boundary is LLM_LOG_RETENTION_DAYS; checking every 6h (and
    # once immediately at startup, via _last_prune_monotonic starting at 0)
    # keeps the table bounded without a separate cron/worker mechanism.
    PRUNE_CHECK_INTERVAL = 6 * 3600.0

    def __init__(self) -> None:
        self._buf: list[dict[str, Any]] = []
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        # Init at startup, NOT 0: 0 made the first flush tick (~5s after
        # boot) immediately DELETE every row past retention — a surprise
        # bulk delete before ops could confirm the (previously dead)
        # LLM_LOG_RETENTION_DAYS knob. One full interval of grace instead.
        self._last_prune_monotonic: float = time.monotonic()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._flush_loop())

    def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def add(self, trace: dict[str, Any]) -> None:
        # P4.4: gating moved inside ``add`` so callers (``_log_call`` /
        # ``_log_cache_hit``) no longer need to repeat the feature-flag
        # check at every call site. Centralizing here means a future
        # change to the gate (e.g. sampling, env override) lives in one
        # place instead of two.
        if not get_settings().llm_log_enabled:
            return
        self._buf.append(trace)
        if len(self._buf) >= self.MAX_BUFFER:
            asyncio.ensure_future(self.flush())

    async def flush(self) -> int:
        async with self._lock:
            if not self._buf:
                return 0
            batch = self._buf[:self.MAX_BUFFER]
            self._buf = self._buf[self.MAX_BUFFER:]

        try:
            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace

            async with db_error_guard('observability.trace_flush', batch_size=len(batch)):
                async with async_session() as session:
                    session.add_all([LLMCallTrace(**t) for t in batch])
                    await session.commit()
            logger.debug('Trace flush: %d records written', len(batch))
            return len(batch)
        except Exception:
            logger.warning(
                'Trace flush failed (%d records dropped)',
                len(batch),
                exc_info=True,
            )
            return 0

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(self.FLUSH_INTERVAL)
            if self._buf:
                await self.flush()
            await self._maybe_prune()

    async def _maybe_prune(
        self, session_factory: Any | None = None,
    ) -> int:
        """Delete trace rows older than ``llm_log_retention_days``.

        Previously ``LLM_LOG_RETENTION_DAYS`` had a config knob but no
        consumer — the table grew unboundedly (engineering-upgrade leftover
        #3). Runs inside the writer's flush loop: first pass fires right
        after startup, then at most every PRUNE_CHECK_INTERVAL. Retention
        <= 0 disables pruning entirely (keep-forever semantics).

        ``session_factory`` is injectable for tests (hermetic DB); defaults
        to the app sessionmaker.
        """
        now = time.monotonic()
        if now - self._last_prune_monotonic < self.PRUNE_CHECK_INTERVAL:
            return 0
        self._last_prune_monotonic = now

        settings = get_settings()
        # Respect the master switch: a deployment that opted out of trace
        # logging must not have its (historical) rows deleted either.
        if not settings.llm_log_enabled:
            return 0
        retention_days = settings.llm_log_retention_days
        if retention_days <= 0:
            return 0
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)

        try:
            from sqlalchemy import delete, select

            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace

            factory = session_factory or async_session
            # Batched DELETE: the table grew unboundedly while the knob was
            # dead — an unbatched first sweep would hold one long transaction
            # (locks + WAL bloat). 5k rows per statement keeps each cheap.
            batch_limit = 5000
            total_deleted = 0
            while True:
                async with db_error_guard('observability.trace_prune'):
                    async with factory() as session:
                        stale_ids = (await session.execute(
                            select(LLMCallTrace.id)
                            .where(LLMCallTrace.created_at < cutoff)
                            .order_by(LLMCallTrace.created_at)
                            .limit(batch_limit),
                        )).scalars().all()
                        if not stale_ids:
                            break
                        result = await session.execute(
                            delete(LLMCallTrace).where(LLMCallTrace.id.in_(stale_ids)),
                        )
                        await session.commit()
                        total_deleted += result.rowcount or 0
                if len(stale_ids) < batch_limit:
                    break
            if total_deleted:
                logger.info('Trace prune: deleted %d rows older than %dd', total_deleted, retention_days)
            return total_deleted
        except Exception:
            logger.warning('Trace prune failed', exc_info=True)
            return 0


_trace_writer = _TraceWriter()
