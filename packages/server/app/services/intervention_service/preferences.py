"""Intervention preferences — Redis-backed user preference storage."""

import json
import logging
from uuid import UUID

import redis.exceptions

from app.core.redis import get_redis

logger = logging.getLogger('read-pal.intervention_prefs')


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
    try:
        redis = get_redis()
        raw = await redis.get(_prefs_redis_key(user_id))
        if raw:
            return json.loads(raw)
    except (json.JSONDecodeError, ValueError, ConnectionError) as exc:
        logger.warning('intervention_prefs.get_failed user=%s error=%s', user_id, exc)
    return {**DEFAULT_PREFS}


async def update_preferences(
    user_id: UUID,
    prefs_body: dict,
) -> dict:
    """Merge incoming preference values over defaults and persist to Redis."""
    prefs = {**DEFAULT_PREFS}
    for field in _PREFERENCE_FIELDS:
        val = getattr(prefs_body, field, None)
        if val is not None:
            prefs[field] = val

    try:
        redis = get_redis()
        await redis.set(
            _prefs_redis_key(user_id),
            json.dumps(prefs),
            ex=60 * 60 * 24 * 365,  # 1 year TTL
        )
    except redis.exceptions.RedisError as exc:
        logger.warning('intervention_prefs.set_failed user=%s error=%s', user_id, exc)

    return prefs
