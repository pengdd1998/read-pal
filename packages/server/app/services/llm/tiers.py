"""Call tiers — route auxiliary LLM calls to a provider's quick model.

A companion turn makes several model calls. Only one of them (the answer)
needs the strongest default model; the others — query expansion, tool
planning, the faithfulness check — are small classification/extraction jobs.
Running those on a reasoning default was measured at 14-32s per call with
the reasoning budget eating the small ``max_tokens`` (P9.3): the keyword
expansion came back EMPTY after 14s on glm-4.7-flash, versus 1.4s and a
real keyword list on glm-4-flash.

``safe_llm_call(..., tier='fast')`` scopes the tier to that call through a
ContextVar, so the whole primary → next-provider → same-provider fallback
chain resolves the quick model without threading a flag through every
helper signature.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from typing import Any

_TIER: ContextVar[str] = ContextVar('llm_call_tier', default='default')

# Vendors known to accept ``thinking: {"type": "disabled"}`` in the request
# body. Others get no extra field rather than risking a 400 on an unknown
# parameter.
_THINKING_TOGGLE_HOSTS = ('bigmodel.cn', 'api.z.ai')


async def call_in_tier(tier: str, fn: Callable[..., Awaitable[Any]], **kwargs: Any) -> Any:
    """Await *fn(**kwargs)* with *tier* bound for the duration of the call."""
    token = _TIER.set(tier)
    try:
        return await fn(**kwargs)
    finally:
        _TIER.reset(token)


def current_tier() -> str:
    return _TIER.get()


def fast_model(config: Any) -> str:
    """Model a ``tier='fast'`` call uses on *config*.

    Explicit ``models.fast`` wins; otherwise the fallback model — by
    convention the cheaper, quicker sibling of the default — and finally the
    default itself.
    """
    models = config.models
    return models.get('fast') or models.get('fallback') or config.default_model


def model_for(config: Any) -> str:
    """Model the current call uses on *config*, per the active tier."""
    return fast_model(config) if current_tier() == 'fast' else config.default_model


def supports_thinking_toggle(config: Any) -> bool:
    """Whether the provider's vendor accepts ``thinking: {"type": ...}``."""
    host = config.base_url.split('//')[-1].split('/')[0].split(':')[0].lower()
    return host.endswith(_THINKING_TOGGLE_HOSTS)


def disable_thinking_for(config: Any) -> bool:
    """Fast-tier calls turn hidden reasoning off where the vendor supports it.

    Reasoning tokens are emitted before the first visible token, so a
    "fast" call that still thinks is neither fast nor, under a small
    ``max_tokens``, guaranteed to produce any answer at all.
    """
    return current_tier() == 'fast' and supports_thinking_toggle(config)


def is_rate_limited(exc: BaseException) -> bool:
    """True for a vendor 429 — a capacity signal for one model, not an outage."""
    return getattr(exc, 'status_code', None) == 429


# Vendor/HTTP timeout classes, matched by name: the openai SDK's
# APITimeoutError and httpx's timeout family do not subclass TimeoutError,
# and this module must not import them (pool.py imports it at startup).
_TIMEOUT_CLASS_NAMES = frozenset({
    'APITimeoutError', 'ReadTimeout', 'ConnectTimeout', 'WriteTimeout',
    'PoolTimeout', 'TimeoutException',
})


def is_timeout(exc: BaseException) -> bool:
    """True for a request that ran out of time rather than being refused."""
    if isinstance(exc, TimeoutError):
        return True
    return bool(_TIMEOUT_CLASS_NAMES & {cls.__name__ for cls in type(exc).__mro__})


def is_config_error(exc: BaseException) -> bool:
    """True for vendor failures no retry can fix.

    A revoked key (401/403) or a retired/unknown model (400/404 naming the
    model) is a deployment problem: the provider must leave rotation until
    ops fix it, not be re-probed every few seconds (P9.1). A generic 400 —
    our own prompt too long, a bad parameter — is NOT one: those are
    request-specific and must keep the ordinary breaker behaviour.
    """
    status = getattr(exc, 'status_code', None)
    if status in (401, 403):
        return True
    if status in (400, 404):
        message = str(exc).lower()
        return any(
            marker in message
            for marker in (
                'unsupported model', 'model not found', 'model does not exist',
                'invalid model', 'no such model', 'unknown model',
            )
        )
    return False
