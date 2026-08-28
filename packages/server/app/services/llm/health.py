"""LLM health check — probe all registered providers."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from langchain_core.messages import HumanMessage

logger = structlog.get_logger('read-pal.llm')

_health_cache: dict[str, Any] | None = None
_health_cached_at: float = 0.0


async def _probe_provider(
    name: str,
    default_model: str,
    circuit_open: bool,
) -> dict[str, Any]:
    """Probe a single provider and return its health status."""
    from app.services.llm.pool import get_llm

    start = time.monotonic()
    try:
        llm = get_llm(provider=name, temperature=0.0, max_tokens=1)
        await asyncio.wait_for(
            llm.ainvoke([HumanMessage(content='Hi')]),
            timeout=5.0,
        )
        latency_ms = int((time.monotonic() - start) * 1000)
        return {
            'healthy': True,
            'model': default_model,
            'latency_ms': latency_ms,
            'circuit_open': circuit_open,
        }
    except (TimeoutError, ConnectionError, RuntimeError, ValueError) as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error('llm_health_check_failed', provider=name, error=str(exc))
        return {
            'healthy': False,
            'model': default_model,
            'latency_ms': latency_ms,
            'circuit_open': circuit_open,
            'error': 'Provider health check failed',
        }


async def check_llm_health() -> dict[str, Any]:
    """Probe all registered providers and return composite health status.

    Result is cached for 60 seconds to avoid flooding providers.
    """
    global _health_cache, _health_cached_at
    if _health_cache and (time.monotonic() - _health_cached_at) < 60:
        return _health_cache

    from app.services.llm.registry import get_registry

    registry = get_registry()
    providers = registry.all_providers()

    if not providers:
        result: dict[str, Any] = {
            'healthy': False,
            'providers': {},
            'error': 'No providers configured',
        }
        _health_cache = result
        _health_cached_at = time.monotonic()
        return result

    # Probe all providers in parallel
    tasks = {}
    for state in providers:
        tasks[state.config.name] = _probe_provider(
            state.config.name,
            state.config.default_model,
            state.circuit.is_open,
        )

    results = {}
    for name, task in tasks.items():
        results[name] = await task

    overall_healthy = any(r.get('healthy') for r in results.values())

    result = {
        'healthy': overall_healthy,
        'providers': results,
    }
    _health_cache = result
    _health_cached_at = time.monotonic()
    return result
