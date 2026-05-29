"""LLM health check — cached probe to verify GLM connectivity."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from langchain_core.messages import HumanMessage

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

_health_cache: dict[str, Any] | None = None
_health_cached_at: float = 0.0


async def check_llm_health() -> dict[str, Any]:
    """Send a minimal probe request to GLM and return health status.

    Result is cached for 60 seconds to avoid flooding the provider.
    """
    global _health_cache, _health_cached_at
    if _health_cache and (time.monotonic() - _health_cached_at) < 60:
        return _health_cache

    from app.services.llm.pool import get_llm
    from app.services.llm.circuit_breaker import circuit

    settings = get_settings()
    start = time.monotonic()
    try:
        llm = get_llm(temperature=0.0, max_tokens=1)
        await asyncio.wait_for(
            llm.ainvoke([HumanMessage(content='Hi')]),
            timeout=5.0,
        )
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
