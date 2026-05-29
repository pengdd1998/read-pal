"""LLM client pool — cache ChatOpenAI instances per (model, temperature) tuple."""

from __future__ import annotations

import structlog
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

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


async def shutdown_llm() -> None:
    """Close all pooled HTTP connections and flush traces.

    Call on app shutdown.
    """
    from app.services.llm.observability import _trace_writer

    _pool.clear()
    await _trace_writer.flush()
    _trace_writer.cancel()
    logger.info('llm_pool_shutdown')
