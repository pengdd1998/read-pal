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
import logging
import time
import uuid
from collections import OrderedDict
from collections.abc import AsyncGenerator
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings

# Try to import openai's RateLimitError for precise detection
try:
    from openai import RateLimitError as _OpenAIRateLimitError
except ImportError:
    _OpenAIRateLimitError = None  # type: ignore[assignment,misc]

logger = logging.getLogger('read-pal.llm')


# ---------------------------------------------------------------------------
# Custom exception types
# ---------------------------------------------------------------------------

class RateLimitError(Exception):
    """Raised when an LLM provider returns a 429 rate limit response."""


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
) -> None:
    """Structured log for every LLM call + persist to DB."""
    cost = _estimate_cost(
        model,
        usage.get('prompt_tokens', 0),
        usage.get('completion_tokens', 0),
    )
    logger.info(
        'LLM_CALL req=%s model=%s label=%s latency=%dms '
        'prompt_tok=%d completion_tok=%d total_tok=%d '
        'cost=%.6f success=%s fallback=%s',
        request_id,
        model,
        label,
        latency_ms,
        usage.get('prompt_tokens', 0),
        usage.get('completion_tokens', 0),
        usage.get('total_tokens', 0),
        cost,
        success,
        fallback_used,
    )
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
_MAX_POOL_SIZE = 20  # Prevent unbounded growth from temperature permutations


def get_llm(
    temperature: float = 0.7,
    max_tokens: int = 2000,
    model: str | None = None,
) -> ChatOpenAI:
    """Return a pooled ChatOpenAI instance configured for GLM.

    Instances are cached per ``(model, temperature)`` so HTTP connections
    are reused across requests.  Pool is capped at ``_MAX_POOL_SIZE``
    entries — oldest entry is evicted when the limit is reached.
    """
    settings = get_settings()
    model = model or settings.default_model
    key = (model, temperature)
    if key not in _pool:
        if len(_pool) >= _MAX_POOL_SIZE:
            oldest_key = next(iter(_pool))
            del _pool[oldest_key]
            logger.debug('Evicted LLM pool entry %s (pool size cap)', oldest_key)
        _pool[key] = ChatOpenAI(
            model=model,
            api_key=settings.glm_api_key,
            base_url=settings.glm_base_url,
            temperature=temperature,
            max_tokens=max_tokens,
            max_retries=settings.llm_max_retries,
            request_timeout=settings.llm_timeout_seconds,
        )
        logger.debug('Created new LLM pool entry for %s @ temp=%.02f', model, temperature)
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
    logger.info('LLM connection pool shut down')


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
                    logger.info('Circuit breaker → HALF_OPEN (probe allowed)')
                    return True
                return False
            # HALF_OPEN — allow single probe
            return True

    async def record_success(self) -> None:
        async with self._lock:
            self._failures = 0
            if self.state != CircuitState.CLOSED:
                self.state = CircuitState.CLOSED
                logger.info('Circuit breaker → CLOSED (probe succeeded)')

    async def record_failure(self) -> None:
        async with self._lock:
            self._failures += 1
            settings = get_settings()
            if self.state == CircuitState.HALF_OPEN:
                self.state = CircuitState.OPEN
                self._opened_at = time.monotonic()
                logger.warning('Circuit breaker → OPEN (probe failed)')
            elif self._failures >= settings.circuit_failure_threshold:
                self.state = CircuitState.OPEN
                self._opened_at = time.monotonic()
                logger.warning(
                    'Circuit breaker → OPEN (%d consecutive failures)',
                    self._failures,
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

# OrderedDict gives O(1) eviction by insertion order (LRU semantics)
_in_memory_cache: OrderedDict[str, tuple[float, str]] = OrderedDict()
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
            # Move to end (most recently used)
            _in_memory_cache.move_to_end(key)
            return val
        del _in_memory_cache[key]

    try:
        from app.core.redis import get_redis as _get_redis
        r = _get_redis()
        return await r.get(key)
    except Exception:
        return None


async def _cache_set(key: str, value: str) -> None:
    """Store LLM response in Redis (fallback: in-memory).

    Uses OrderedDict for O(1) eviction — oldest (first) entries are
    removed first, and accessed entries are moved to the end.
    """
    _in_memory_cache[key] = (time.monotonic(), value)
    _in_memory_cache.move_to_end(key)

    # Evict oldest entries until under the cap
    while len(_in_memory_cache) > _MAX_IN_MEMORY_CACHE:
        _in_memory_cache.popitem(last=False)

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
        logger.error('LLM health check failed: %s', exc)
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


def _is_rate_limit_error(exc: Exception) -> bool:
    """Check if an exception indicates a 429 rate limit response from the provider."""
    # Check against openai's RateLimitError if available
    if _OpenAIRateLimitError is not None and isinstance(exc, _OpenAIRateLimitError):
        return True
    # Check for status_code == 429 attribute (langchain wraps openai errors)
    if getattr(exc, 'status_code', None) == 429:
        return True
    return False


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
            if _is_rate_limit_error(exc) and attempt < len(_RATE_LIMIT_BACKOFFS):
                logger.warning(
                    '%s rate limited (attempt %d/%d), retrying in %ds',
                    log_label, attempt + 1, len(_RATE_LIMIT_BACKOFFS), backoff,
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
        logger.warning('%s blocked by circuit breaker', log_label)
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
        )
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error('%s primary (%s) failed: %s', log_label, model_used, exc)
        await circuit.record_failure()
        _log_call(
            request_id=request_id,
            model=model_used,
            label=log_label,
            latency_ms=latency_ms,
            usage={},
            success=False,
            error_message=str(exc),
        )
        # Try fallback model
        try:
            fb_start = time.monotonic()
            fallback_model = settings.fallback_model
            logger.info('%s retrying with fallback model %s', log_label, fallback_model)
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
            )
        except Exception as fb_exc:
            logger.error('%s fallback also failed: %s', log_label, fb_exc)
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

    response = await _invoke_with_circuit(messages, log_label=log_label)
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
            '%s: failed to parse LLM response as JSON (first 200 chars): %.200s',
            log_label, content,
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
            '%s: schema validation failed (%s). Returning raw parsed data.',
            log_label, exc,
        )
        return data


async def safe_llm_call(
    messages: list[BaseMessage],
    *,
    fallback: str = '',
    log_label: str = 'LLM',
    use_cache: bool = True,
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

    response = await _invoke_with_circuit(messages, log_label=log_label)
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


# ---------------------------------------------------------------------------
# Streaming with circuit breaker + fallback
# ---------------------------------------------------------------------------

async def stream_with_circuit(
    messages: list[BaseMessage],
    *,
    log_label: str = 'LLM_stream',
    flush_size: int = 5,
    filter_fn: Any | None = None,
) -> AsyncGenerator[tuple[str, str], None]:
    """Stream LLM response with circuit breaker, fallback model, and observability.

    Yields ``(chunk_type, content)`` tuples:
      - ``('token', text)`` — a safe chunk to emit to the client
      - ``('error', message)`` — fallback error text when all attempts fail
      - ``('done', '')`` — stream complete (always yielded last)

    The caller is responsible for formatting these as SSE events.

    ``filter_fn`` is an optional callable ``str -> str | None`` applied to
    each flushed buffer of tokens.  If it returns ``None`` the chunk is
    suppressed.  When not provided, ``filter_stream_chunk`` from
    ``output_filter`` is used.
    """
    from collections.abc import AsyncGenerator as _AG

    if filter_fn is None:
        from app.utils.output_filter import filter_stream_chunk
        filter_fn = filter_stream_chunk

    settings = get_settings()
    request_id = uuid.uuid4().hex[:12]
    start_time = time.monotonic()
    model_used = settings.default_model
    collected: list[str] = []
    chunk_buffer: list[str] = []

    async def _drain(llm_instance: ChatOpenAI) -> bool:
        """Stream from *llm_instance*, buffering and filtering. Return True on success."""
        nonlocal chunk_buffer
        async for chunk in llm_instance.astream(messages):
            token = chunk.content
            if token:
                collected.append(token)
                chunk_buffer.append(token)
                if len(chunk_buffer) >= flush_size:
                    buffered_text = ''.join(chunk_buffer)
                    safe_text = filter_fn(buffered_text, context=log_label)
                    if safe_text:
                        yield ('token', safe_text)
                    chunk_buffer = []
        # Flush remaining buffer
        if chunk_buffer:
            buffered_text = ''.join(chunk_buffer)
            safe_text = filter_fn(buffered_text, context=log_label)
            if safe_text:
                yield ('token', safe_text)
            chunk_buffer = []
        return

    # Circuit breaker gate
    if not await circuit.allow_request():
        logger.warning('%s blocked by circuit breaker', log_label)
        yield ('error', '')
        yield ('done', '')
        return

    # Primary model attempt
    try:
        llm = get_llm()
        async for event in _drain(llm):
            yield event
            if event[0] == 'token':
                continue
        await circuit.record_success()
        latency_ms = int((time.monotonic() - start_time) * 1000)
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage={'completion_tokens': len(collected)},
            success=True,
        )
        yield ('done', '')
        return
    except Exception as exc:
        latency_ms = int((time.monotonic() - start_time) * 1000)
        logger.error('%s primary (%s) failed: %s', log_label, model_used, exc)
        await circuit.record_failure()
        _log_call(
            request_id=request_id, model=model_used, label=log_label,
            latency_ms=latency_ms, usage={}, success=False, error_message=str(exc),
        )

    # Fallback model attempt
    fb_model = settings.fallback_model
    try:
        logger.info('%s retrying with fallback %s', log_label, fb_model)
        fb_start = time.monotonic()
        llm_fb = get_llm(model=fb_model)
        async for event in _drain(llm_fb):
            yield event
        await circuit.record_success()
        fb_latency_ms = int((time.monotonic() - fb_start) * 1000)
        _log_call(
            request_id=request_id, model=fb_model, label=log_label,
            latency_ms=fb_latency_ms, usage={'completion_tokens': len(collected)},
            success=True, fallback_used=True,
        )
        yield ('done', '')
        return
    except Exception as fb_exc:
        logger.error('%s fallback (%s) also failed: %s', log_label, fb_model, fb_exc)
        await circuit.record_failure()
        _log_call(
            request_id=request_id, model=fb_model, label=log_label,
            latency_ms=int((time.monotonic() - start_time) * 1000),
            usage={}, success=False, fallback_used=True, error_message=str(fb_exc),
        )
        yield ('error', '')
        yield ('done', '')
