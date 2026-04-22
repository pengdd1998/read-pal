"""LLM service — resilient wrapper around langchain-openai for GLM.

Features: connection pooling, circuit breaker, multi-model fallback,
health check, timeout management, and observability (token tracking,
latency, cost estimation, request tracing).
"""

from __future__ import annotations

import asyncio
import enum
import json
import logging
import time
import uuid
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = logging.getLogger('read-pal.llm')

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
) -> None:
    """Structured log for every LLM call."""
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
        logger.debug('Created new LLM pool entry for %s @ temp=%.2f', model, temperature)
    return _pool[key]


async def shutdown_llm() -> None:
    """Close all pooled HTTP connections. Call on app shutdown."""
    _pool.clear()
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
        await llm.ainvoke([HumanMessage(content='Hi')])
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
        response = await llm.ainvoke(messages)
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
        )
        # Try fallback model
        try:
            fb_start = time.monotonic()
            fallback_model = settings.fallback_model
            logger.info('%s retrying with fallback model %s', log_label, fallback_model)
            llm = get_llm(model=fallback_model)
            response = await llm.ainvoke(messages)
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
            return None

    return response


async def safe_llm_invoke(
    messages: list[BaseMessage],
    *,
    fallback: Any = None,
    log_label: str = 'LLM',
    schema_class: type | None = None,
) -> Any:
    """Invoke LLM with circuit breaker, fallback model, and JSON parsing.

    On primary model failure the configured ``fallback_model`` is tried.
    Returns parsed JSON (optionally validated against *schema_class*),
    stripped markdown fences, or *fallback* on failure.
    """
    response = await _invoke_with_circuit(messages, log_label=log_label)
    if response is None:
        return fallback

    content = response.content.strip()
    content = _strip_markdown_fences(content)

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
) -> str:
    """Invoke LLM with circuit breaker + fallback model, returning raw text.

    Unlike ``safe_llm_invoke``, this does NOT attempt JSON parsing.
    Returns the response content as a string, or *fallback* on failure.
    Applies output safety filtering.
    """
    response = await _invoke_with_circuit(messages, log_label=log_label)
    if response is None:
        return fallback
    content = response.content.strip()

    # Apply output filter
    from app.utils.output_filter import filter_output
    content = filter_output(content, context=log_label)

    return content
