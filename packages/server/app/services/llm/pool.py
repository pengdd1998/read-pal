"""LLM client pool — cache ChatOpenAI instances per (provider, model, temperature, max_tokens)."""

from __future__ import annotations

from typing import Any

import structlog
from langchain_openai import ChatOpenAI

from app.config import get_settings

logger = structlog.get_logger('read-pal.llm')

# Legacy pool kept for backward compat when registry is not used
_pool: dict[tuple[str, float, int], ChatOpenAI] = {}


def get_llm(
    temperature: float = 0.7,
    max_tokens: int = 2000,
    model: str | None = None,
    provider: str | None = None,
    feature: str | None = None,
    structured_output: bool = False,
) -> ChatOpenAI:
    """Return a pooled ChatOpenAI instance.

    Routes through the provider registry when provider or feature is given.
    Falls back to legacy single-provider pool when neither is specified
    and the registry has a single provider.

    Pool key includes ``max_tokens`` so two callers requesting the same
    (model, temperature) but different ``max_tokens`` get distinct pool
    entries — previously the second caller silently inherited the first's
    ``max_tokens`` value because the ChatOpenAI instance is constructed
    once per pool entry.

    C2: ``structured_output`` adds ``response_format={'type': 'json_object'}``
    via ``model_kwargs``. The pool key includes the flag so the two
    variants get distinct ChatOpenAI instances — otherwise flipping the
    feature on for one caller would mutate the shared instance's kwargs
    for all callers.
    """
    from app.services.llm.registry import get_registry

    registry = get_registry()
    settings = get_settings()

    # Determine which provider to use
    state = None
    if provider:
        state = registry.get_provider_by_name(provider)
    if state is None:
        state = registry.get_provider(feature=feature)

    if state is None:
        # Ultimate fallback: legacy pool
        return _get_legacy_llm(temperature, max_tokens, model, structured_output)

    model_name = model or state.config.default_model
    state.increment_rpm()
    key = (model_name, temperature, max_tokens, structured_output)
    if key not in state.pool:
        kwargs: dict[str, Any] = {
            'model': model_name,
            'api_key': state.config.api_key,
            'base_url': state.config.base_url,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'max_retries': settings.llm_max_retries,
            'request_timeout': settings.llm_timeout_seconds,
        }
        if structured_output:
            # OpenAI-compatible providers expose 'json_object' as a
            # broadly-supported mode (vs 'json_schema' which needs a full
            # schema payload). json_object mode requires the prompt to
            # mention "JSON" somewhere — call sites using safe_llm_invoke
            # with a schema_class already do.
            kwargs['model_kwargs'] = {'response_format': {'type': 'json_object'}}
        state.pool[key] = ChatOpenAI(**kwargs)
        logger.debug(
            'llm_pool_entry_created',
            provider=state.config.name,
            model=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            structured_output=structured_output,
        )
    return state.pool[key]


def _get_legacy_llm(
    temperature: float,
    max_tokens: int,
    model: str | None,
    structured_output: bool = False,
) -> ChatOpenAI:
    """Legacy single-provider pool for backward compatibility."""
    settings = get_settings()
    model_name = model or settings.default_model
    key = (model_name, temperature, max_tokens, structured_output)
    if key not in _pool:
        kwargs: dict[str, Any] = {
            'model': model_name,
            'api_key': settings.glm_api_key,
            'base_url': settings.glm_base_url,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'max_retries': settings.llm_max_retries,
            'request_timeout': settings.llm_timeout_seconds,
        }
        if structured_output:
            kwargs['model_kwargs'] = {'response_format': {'type': 'json_object'}}
        _pool[key] = ChatOpenAI(**kwargs)
        logger.debug('llm_legacy_pool_entry_created', model=model_name)
    return _pool[key]


async def shutdown_llm() -> None:
    """Close all pooled HTTP connections and flush traces."""
    from app.services.llm.observability import _trace_writer

    _pool.clear()

    from app.services.llm.registry import get_registry
    registry = get_registry()
    for state in registry.all_providers():
        state.pool.clear()

    await _trace_writer.flush()
    _trace_writer.cancel()
    logger.info('llm_pool_shutdown')
