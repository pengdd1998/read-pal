"""LLM service — resilient wrapper around langchain-openai for GLM.

Features: connection pooling, circuit breaker, multi-model fallback,
health check, timeout management, response caching, and observability
(token tracking, latency, cost estimation, request tracing).
"""

from __future__ import annotations

import asyncio
import enum
import hashlib
import json
import time
import uuid
from typing import Any

import structlog
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Observability — structured call logging
# ---------------------------------------------------------------------------

# Rough cost per 1K tokens (USD) for GLM models
_COST_PER_1K: dict[str, dict[str, float]] = {
    'glm-4.7-flash': {'input': 0.0001, 'output': 0.0001},
    'glm-4-flash': {'input': 0.0001, 'output': 0.0001},
    'glm-4': {'input': 0.001, 'output': 0.001},
}

# Heuristic: chars per token for estimation when response_metadata is absent
_CHARS_PER_TOKEN = 4


def _estimate_tokens_from_chars(text: str) -> int:
    return max(len(text) // _CHARS_PER_TOKEN, 1)


def _extract_usage(response: Any) -> dict[str, int]:
    """Extract token usage from LLM response metadata."""
    usage = {}
    # langchain-openai stores usage in response_metadata
    meta = getattr(response, 'response_metadata', {}) or {}
    token_usage = meta.get('token_usage', {})
    if token_usage:
        usage['prompt_tokens'] = token_usage.get('prompt_tokens', 0)
        usage['completion_tokens'] = token_usage.get('completion_tokens', 0)
        usage['total_tokens'] = token_usage.get('total_tokens', 0)
    if not usage.get('total_tokens'):
        # Fallback: estimate from content length
        content = getattr(response, 'content', '') or ''
        usage['completion_tokens'] = _estimate_tokens_from_chars(content)
        usage['total_tokens'] = usage['completion_tokens']
    return usage


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for a single call."""
    rates = _COST_PER_1K.get(model, _COST_PER_1K['glm-4.7-flash'])
    return (
        prompt_tokens / 1000 * rates['input']
        + completion_tokens / 1000 * rates['output']
    )


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
    user_id: str | None = None,
    book_id: str | None = None,
) -> None:
    """Structured log for every LLM call — console + DB persistence."""
    cost = _estimate_cost(
        model,
        usage.get('prompt_tokens', 0),
        usage.get('completion_tokens', 0),
    )
    logger.info(
        'llm_call',
        request_id=request_id,
        model=model,
        label=label,
        latency_ms=latency_ms,
        prompt_tokens=usage.get('prompt_tokens', 0),
        completion_tokens=usage.get('completion_tokens', 0),
        total_tokens=usage.get('total_tokens', 0),
        estimated_cost=round(cost, 6),
        success=success,
        fallback=fallback_used,
        user_id=user_id,
        book_id=book_id,
    )
    # Persist via buffered trace writer (includes user_id/book_id)
    if get_settings().llm_log_enabled:
        _trace_writer.add({
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
        })

# ---------------------------------------------------------------------------
# Connection pool — cache ChatOpenAI per (model, temperature) tuple
# ---------------------------------------------------------------------------

_pool: dict[tuple[str, float], ChatOpenAI] = {}


def get_llm(
    temperature: float = 0.7,
    max_tokens: int = 2000,
    model: str | None = None,
) -> ChatOpenAI:
    """Return a pooled ChatOpenAI instance configured for GLM.

    Instances are cached per ``(model, temperature)`` so HTTP connections
    are reused across requests.
    """
    settings = get_settings()
    model = model or settings.default_model
    key = (model, temperature)
    if key not in _pool:
        _pool[key] = ChatOpenAI(
            model=model,
            api_key=settings.glm_api_key,
            base_url=settings.glm_base_url,
            temperature=temperature,
            max_tokens=max_tokens,
            max_retries=settings.llm_max_retries,
            request_timeout=settings.llm_timeout_seconds,
        )
        logger.debug('llm_pool_entry_created', model=model, temperature=temperature)
    return _pool[key]


# ---------------------------------------------------------------------------
# Trace writer — async buffered persistence to PostgreSQL
# ---------------------------------------------------------------------------

class _TraceWriter:
    """Buffered, fire-and-forget writer for LLM call traces.

    Collects trace dicts in memory and flushes to PostgreSQL in batches.
    Write failures are logged but never propagated to callers.
    """

    MAX_BUFFER = 50
    FLUSH_INTERVAL = 5.0

    def __init__(self) -> None:
        self._buf: list[dict[str, Any]] = []
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    def start(self) -> None:
        """Start the periodic flush background task."""
        if self._task is None or self._task.done():
            self._task = asyncio.ensure_future(self._flush_loop())

    def cancel(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def add(self, trace: dict[str, Any]) -> None:
        """Add a trace record. Flushes immediately if buffer is full."""
        self._buf.append(trace)
        if len(self._buf) >= self.MAX_BUFFER:
            asyncio.ensure_future(self.flush())

    async def flush(self) -> int:
        """Flush buffered traces to PostgreSQL. Returns count written."""
        async with self._lock:
            if not self._buf:
                return 0
            batch = self._buf[:self.MAX_BUFFER]
            self._buf = self._buf[self.MAX_BUFFER:]

        try:
            from app.db import async_session
            from app.models.llm_trace import LLMCallTrace

            async with async_session() as session:
                session.add_all([LLMCallTrace(**t) for t in batch])
                await session.commit()
            logger.debug('Trace flush: %d records written', len(batch))
            return len(batch)
        except Exception:
            logger.warning('Trace flush failed (%d records dropped)', len(batch), exc_info=True)
            return 0

    async def _flush_loop(self) -> None:
        """Background task: flush on interval."""
        while True:
            await asyncio.sleep(self.FLUSH_INTERVAL)
            if self._buf:
                await self.flush()


_trace_writer = _TraceWriter()


async def shutdown_llm() -> None:
    """Close all pooled HTTP connections and flush traces. Call on app shutdown."""
    _pool.clear()
    await _trace_writer.flush()
    _trace_writer.cancel()
    logger.info('llm_pool_shutdown')


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class CircuitState(enum.Enum):
    CLOSED = 'closed'
    OPEN = 'open'
    HALF_OPEN = 'half_open'


class CircuitBreaker:
    """Simple async-safe circuit breaker — no external dependencies."""

    def __init__(self) -> None:
        self.state = CircuitState.CLOSED
        self._failures = 0
        self._opened_at: float = 0.0
        self._lock = asyncio.Lock()

    async def allow_request(self) -> bool:
        """Return True if a request is allowed to proceed."""
        async with self._lock:
            if self.state == CircuitState.CLOSED:
                return True
            if self.state == CircuitState.OPEN:
                settings = get_settings()
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= settings.circuit_reset_timeout_seconds:
                    self.state = CircuitState.HALF_OPEN
                    logger.info('circuit_breaker_half_open')
                    return True
                return False
            # HALF_OPEN — allow single probe
            return True

    async def record_success(self) -> None:
        async with self._lock:
            self._failures = 0
            if self.state != CircuitState.CLOSED:
                self.state = CircuitState.CLOSED
                logger.info('circuit_breaker_closed')

    async def record_failure(self) -> None:
        async with self._lock:
            self._failures += 1
            settings = get_settings()
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                self._opened_at = time.monotonic()
                logger.warning('circuit_breaker_open_probe_failed')
            elif self._failures >= settings.circuit_failure_threshold:
                self.state = CircuitState.OPEN
                self._opened_at = time.monotonic()
                logger.warning(
                    'circuit_breaker_open',
                    consecutive_failures=self._failures,
                )

    @property
    def is_open(self) -> bool:
        return self.state == CircuitState.OPEN


circuit = CircuitBreaker()


# ---------------------------------------------------------------------------
# Response cache — Redis-backed with in-memory fallback
# ---------------------------------------------------------------------------

_CACHE_PREFIX = 'llm:cache:'
_CACHE_TTL = 1800  # 30 minutes — reduces redundant GLM calls on free tier

_in_memory_cache: dict[str, tuple[float, str]] = {}
_MAX_IN_MEMORY_CACHE = 500


def _cache_key(messages: list[BaseMessage], label: str) -> str:
    """Deterministic cache key from messages + label + model version."""
    settings = get_settings()
    parts = [label, settings.default_model]
    for msg in messages:
        parts.append(msg.content)
    digest = hashlib.sha256('|'.join(parts).encode()).hexdigest()[:16]
    return f'{_CACHE_PREFIX}{digest}'


async def _cache_get(key: str) -> str | None:
    """Get cached LLM response from Redis (fallback: in-memory)."""
    if key in _in_memory_cache:
        ts, val = _in_memory_cache[key]
        if time.monotonic() - ts < _CACHE_TTL:
            return val
        del _in_memory_cache[key]

    try:
        from app.core.redis import get_redis as _get_redis
        r = _get_redis()
        return await r.get(key)
    except Exception:
        return None


async def _cache_set(key: str, value: str) -> None:
    """Store LLM response in Redis (fallback: in-memory)."""
    _in_memory_cache[key] = (time.monotonic(), value)
    if len(_in_memory_cache) > _MAX_IN_MEMORY_CACHE:
        # Evict oldest entries
        oldest = sorted(_in_memory_cache.items(), key=lambda x: x[1][0])
        for k, _ in oldest[:len(_in_memory_cache) // 2]:
            del _in_memory_cache[k]

    try:
        from app.core.redis import get_redis as _get_redis
        r = _get_redis()
        await r.setex(key, _CACHE_TTL, value)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Health check (cached for 60 s)
# ---------------------------------------------------------------------------

_health_cache: dict[str, Any] | None = None
_health_cached_at: float = 0.0


async def check_llm_health() -> dict[str, Any]:
    """Send a minimal probe request to GLM and return health status.

    Result is cached for 60 seconds to avoid flooding the provider.
    """
    global _health_cache, _health_cached_at
    if _health_cache and (time.monotonic() - _health_cached_at) < 60:
        return _health_cache

    settings = get_settings()
    start = time.monotonic()
    try:
        llm = get_llm(temperature=0.0, max_tokens=1)
        import asyncio
        await asyncio.wait_for(llm.ainvoke([HumanMessage(content='Hi')]), timeout=5.0)
        latency_ms = int((time.monotonic() - start) * 1000)
        result: dict[str, Any] = {
            'healthy': True,
            'model': settings.default_model,
            'latency_ms': latency_ms,
            'circuit_open': circuit.is_open,
        }
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error('llm_health_check_failed', error=str(exc))
        result = {
            'healthy': False,
            'model': settings.default_model,
            'latency_ms': latency_ms,
            'circuit_open': circuit.is_open,
            'error': str(exc),
        }
    _health_cache = result
    _health_cached_at = time.monotonic()
    return result


# ---------------------------------------------------------------------------
# Safe invoke with circuit breaker + fallback
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
        logger.error('llm_primary_failed', label=log_label, model=model_used, error=str(exc))
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
        try:
            fb_start = time.monotonic()
            fallback_model = settings.fallback_model
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

    return response


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

    response = await _invoke_with_circuit(messages, log_label=log_label, user_id=user_id, book_id=book_id)
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


def _strip_markdown_fences(content: str) -> str:
    """Strip ```json ... ``` and ``` ... ``` wrappers from LLM output."""
    if not content.startswith('```'):
        return content
    lines = content.split('\n')
    # First line is ```json or ``` — skip it
    # Last line is ``` — skip it
    if len(lines) >= 2:
        return '\n'.join(lines[1:-1])
    return content


def _validate_parsed(
    data: Any,
    schema_class: type,
    log_label: str,
) -> Any:
    """Validate parsed JSON against a Pydantic schema. Returns validated data or raw data."""
    try:
        result = schema_class.model_validate(data)
        return result.model_dump()
    except Exception as exc:
        logger.warning(
            'llm_schema_validation_failed',
            label=log_label,
            error=str(exc),
        )
        return data


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
    key = _cache_key(messages, log_label) if use_cache else ''

    # Try cache first
    if key:
        cached = await _cache_get(key)
        if cached is not None:
            from app.utils.output_filter import filter_output
            return filter_output(cached, context=log_label)

    response = await _invoke_with_circuit(messages, log_label=log_label, user_id=user_id, book_id=book_id)
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
