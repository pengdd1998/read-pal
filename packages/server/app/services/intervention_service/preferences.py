"""Intervention preferences — Redis-backed user preference storage."""

import json
from uuid import UUID

from app.core.redis import get_redis


# ---------------------------------------------------------------------------
# Default preferences
# ---------------------------------------------------------------------------

DEFAULT_PREFS: dict = {
    'marathonEnabled': True,
    'longSessionEnabled': True,
    'lowEngagementEnabled': True,
    'welcomeBackEnabled': True,
    'speedDropEnabled': True,
    'reReadingEnabled': True,
    'optimalTimingEnabled': True,
    'quietHoursStart': None,
    'quietHoursEnd': None,
}

_PREFERENCE_FIELDS = (
    'marathonEnabled',
    'longSessionEnabled',
    'lowEngagementEnabled',
    'welcomeBackEnabled',
    'speedDropEnabled',
    'reReadingEnabled',
    'optimalTimingEnabled',
    'quietHoursStart',
    'quietHoursEnd',
)


def _prefs_redis_key(user_id: UUID) -> str:
    return f'intervention_prefs:{user_id}'


async def get_preferences(user_id: UUID) -> dict:
    """Return the user's intervention preferences (or defaults)."""
    redis = get_redis()
    raw = await redis.get(_prefs_redis_key(user_id))

    if raw:
        return json.loads(raw)
    return {**DEFAULT_PREFS}


async def update_preferences(
    user_id: UUID,
    prefs_body: dict,
) -> dict:
    """Merge incoming preference values over defaults and persist to Redis."""
    redis = get_redis()

    prefs = {**DEFAULT_PREFS}
    for field in _PREFERENCE_FIELDS:
        val = getattr(prefs_body, field, None)
        if val is not None:
            prefs[field] = val

    await redis.set(
        _prefs_redis_key(user_id),
        json.dumps(prefs),
        ex=60 * 60 * 24 * 365,  # 1 year TTL
    )

    return prefs
