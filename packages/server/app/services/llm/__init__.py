"""LLM service — resilient wrapper around langchain-openai for multi-provider routing.

This package re-exports all public and internal symbols so that existing
imports like ``from app.services.llm import get_llm, circuit`` continue
to work without changes.

Features: multi-provider routing, connection pooling, per-provider circuit breaker,
health check, timeout management, response caching, and observability
(token tracking, latency, cost estimation, request tracing).
"""

from __future__ import annotations

# -- Observability (token estimation, cost, structured logging, trace writer) --
from app.services.llm.observability import (
    _CHARS_PER_TOKEN,
    _COST_PER_1K,
    _TraceWriter,
    _classify_error,
    _estimate_cost,
    _estimate_tokens_from_chars,
    _extract_usage,
    _log_cache_hit,
    _log_call,
    _trace_writer,
)

# -- Client pool (connection pooling, shutdown) --
from app.services.llm.pool import (
    _pool,
    get_llm,
    shutdown_llm,
)

# -- Circuit breaker --
from app.services.llm.circuit_breaker import (
    CircuitBreaker,
    CircuitState,
    circuit,
)

# -- Response cache (Redis-backed with in-memory fallback) --
from app.services.llm.cache import (
    _CACHE_PREFIX,
    _cache_get,
    _cache_key,
    _cache_set,
    _in_memory_cache,
    _max_in_memory,
    _cache_ttl,
)

# -- Health check --
from app.services.llm.health import (
    check_llm_health,
)

# -- Safe invoke (circuit breaker, multi-provider fallback, caching, JSON parsing) --
from app.services.llm.retry import _invoke_with_retry
from app.services.llm.safe_invoke import (
    _invoke_with_circuit,
    safe_llm_call,
    safe_llm_invoke,
)

# -- Text helpers (markdown fences, schema validation) --
from app.services.llm.text import (
    _strip_markdown_fences,
    _validate_parsed,
)

# -- Provider registry (multi-provider routing) --
from app.services.llm.registry import (
    ProviderRegistry,
    ProviderState,
    get_registry,
    reset_registry,
)

__all__ = [
    # Public API
    'get_llm',
    'shutdown_llm',
    'circuit',
    'CircuitBreaker',
    'CircuitState',
    'check_llm_health',
    'safe_llm_call',
    'safe_llm_invoke',
    # Provider registry
    'ProviderRegistry',
    'ProviderState',
    'get_registry',
    'reset_registry',
    # Observability
    '_log_call',
    '_log_cache_hit',
    '_classify_error',
    '_extract_usage',
    '_estimate_cost',
    '_estimate_tokens_from_chars',
    '_TraceWriter',
    '_trace_writer',
    '_COST_PER_1K',
    '_CHARS_PER_TOKEN',
    # Pool internals
    '_pool',
    # Cache
    '_CACHE_PREFIX',
    '_cache_get',
    '_cache_key',
    '_cache_set',
    '_in_memory_cache',
    '_max_in_memory',
    '_cache_ttl',
    # Safe invoke internals
    '_invoke_with_circuit',
    '_invoke_with_retry',
    '_strip_markdown_fences',
    '_validate_parsed',
]
