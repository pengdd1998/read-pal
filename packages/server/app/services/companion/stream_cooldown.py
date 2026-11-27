"""Per-model rate-limit cooldown for the companion stream (P9.2).

A vendor 429 is a capacity signal for one MODEL, not for the provider: on
the production account glm-4.7-flash answered 429 on 5 of 6 primary attempts
while its sibling glm-4-flash on the same key and provider answered every
time. The circuit breaker is per provider, so it cannot express "skip that
one model for a moment" — and without that, every turn paid the failed
primary attempt again before reaching the model that works.
"""

from __future__ import annotations

import time

# A 429 clears quickly (no Retry-After is sent): short enough that a model
# which recovers is back in rotation within a conversation turn or two.
MODEL_COOLDOWN_S = 30.0
# A model that stalled until the request timeout is a different signal — it
# was not refused, it accepted the work and produced nothing. On the
# production account glm-4.7-flash alternated between the two, and with only
# the 429 handled every stalled turn paid the full timeout again.
STALL_COOLDOWN_S = 300.0

_rate_limited_until: dict[str, float] = {}  # 'provider/model' -> monotonic deadline


def _key(provider: str, model: str) -> str:
    return f'{provider}/{model}'


def note_rate_limited(provider: str, model: str, cooldown_s: float = MODEL_COOLDOWN_S) -> None:
    _rate_limited_until[_key(provider, model)] = time.monotonic() + cooldown_s


def note_stream_failure(provider: str, model: str, exc: BaseException) -> float:
    """Park *model* after it failed before the reader saw its output.

    Returns the cooldown applied. A configuration error parks the whole
    PROVIDER for longer (circuit breaker, P9.1), so nothing is noted here.
    """
    from app.services.llm.tiers import is_config_error, is_timeout

    if is_config_error(exc):
        return 0.0
    cooldown = STALL_COOLDOWN_S if is_timeout(exc) else MODEL_COOLDOWN_S
    note_rate_limited(provider, model, cooldown)
    return cooldown


def model_cooling(provider: str, model: str) -> bool:
    """True while the model is still inside its rate-limit cooldown."""
    return time.monotonic() < _rate_limited_until.get(_key(provider, model), 0.0)


def reset() -> None:
    """Clear all cooldowns (tests)."""
    _rate_limited_until.clear()
