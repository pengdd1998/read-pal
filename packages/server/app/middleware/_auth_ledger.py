"""Token revocation, refresh-replay ledger, and password-reset markers.

Extracted from auth.py to keep each middleware module under the 300-line cap.
"""
import logging
from collections import OrderedDict
from datetime import datetime, UTC

import redis.exceptions

from app.core.redis import get_redis

logger = logging.getLogger('read-pal.auth')

_in_memory_blacklist: OrderedDict[str, None] = OrderedDict()
_redis_ever_connected: bool = False
_MAX_IN_MEMORY_BLACKLIST = 10_000

TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:'
REFRESH_USED_PREFIX = 'auth:refresh-used:'


def _get_redis():
    """Return the shared async Redis client."""
    return get_redis()


async def revoke_token(jti: str, exp: int) -> None:
    """Add a token's jti to the Redis blacklist.

    The key TTL is set to the remaining seconds until the token expires,
    so the entry cleans itself up automatically.
    """
    global _redis_ever_connected

    # Always record in-memory so the fallback is up-to-date
    _in_memory_blacklist[jti] = None
    _in_memory_blacklist.move_to_end(jti)
    while len(_in_memory_blacklist) > _MAX_IN_MEMORY_BLACKLIST:
        _in_memory_blacklist.popitem(last=False)

    try:
        r = _get_redis()
        ttl = max(exp - int(datetime.now(UTC).timestamp()), 1)
        await r.setex(f'{TOKEN_BLACKLIST_PREFIX}{jti}', ttl, '1')
        _redis_ever_connected = True
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('Redis unavailable — token revocation stored in-memory only')


async def is_token_revoked(jti: str) -> bool:
    """Check whether a token's jti has been blacklisted.

    Strategy:
      1. Check Redis — if reachable, authoritative answer.
      2. If Redis is down, check in-memory fallback.
      3. If Redis was never connected, fail-open (allow) — only known-blacklisted
         tokens (via in-memory set) are rejected.
    """
    global _redis_ever_connected

    try:
        r = _get_redis()
        exists = await r.exists(f'{TOKEN_BLACKLIST_PREFIX}{jti}')
        _redis_ever_connected = True
        if exists:
            _in_memory_blacklist[jti] = None
            _in_memory_blacklist.move_to_end(jti)
            return True
        return False
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('auth.redis_blacklist_failed jti=%s', jti[:8] if jti else None)
        if jti in _in_memory_blacklist:
            _in_memory_blacklist.move_to_end(jti)
            return True
        # Fail closed once we've ever successfully talked to Redis: revocation
        # is a security-critical check, and an outage (possibly attacker-induced)
        # must not silently revalidate stolen+revoked tokens. The cold-start
        # window (Redis never reachable) stays fail-open to tolerate dev setups
        # without Redis.
        if _redis_ever_connected:
            return True
        return False


async def _was_password_reset(user_id: str, token_issued_at: float) -> bool:
    """Check if a password reset occurred after this token was issued.

    The marker value is a unix-epoch-seconds timestamp (see
    ``_invalidate_sessions`` and ``change_user_password``). Only tokens whose
    ``iat`` predates the marker are rejected — tokens issued after the reset
    stay valid, so the user is not logged out of their new session.
    Comparing epoch seconds is timezone-safe by construction. A marker in an
    unexpected (legacy, non-numeric) format cannot be ordered against ``iat``,
    so it fails safe and rejects all tokens while it lives.
    """
    try:
        r = _get_redis()
        reset_marker = await r.get(f'pwd-reset:{user_id}')
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('auth.pwd_reset_check_failed user_id=%s', user_id)
        return False

    if reset_marker is None:
        return False

    if isinstance(reset_marker, bytes):
        reset_marker = reset_marker.decode('utf-8', errors='ignore')

    try:
        reset_at = float(reset_marker)
    except (TypeError, ValueError):
        logger.warning(
            'auth.pwd_reset_marker_unparseable user_id=%s', user_id,
        )
        return True

    # ``<=`` rejects tokens minted in the same second as the reset — the
    # window is 1s and erring toward rejection is the safe direction.
    return float(token_issued_at or 0) <= reset_at


async def mark_refresh_used(jti: str, exp: int) -> bool:
    """Atomically mark a refresh-token jti as already rotated.

    Returns True if this is the first time the jti has been seen (legitimate
    rotation), False if the jti was already marked (replay — the same refresh
    token is being used a second time, indicating theft).

    SET NX is both the read and the write of the ledger, so there is no
    separate read path to harden.

    Fail-closed after first contact: once Redis has been reachable, an outage
    returns False (refuse the rotation) — otherwise an attacker (or an
    attacker-induced outage) could replay a stolen refresh token past its
    rotation. Cold start (Redis never reachable) stays fail-open so dev
    setups without Redis keep working.
    """
    global _redis_ever_connected
    try:
        r = _get_redis()
        ttl = max(exp - int(datetime.now(UTC).timestamp()), 1)
        # SET NX = only set if not exists. Returns True if set, None if exists.
        result = await r.set(
            f'{REFRESH_USED_PREFIX}{jti}', '1', ex=ttl, nx=True,
        )
        _redis_ever_connected = True
        return bool(result)
    except (redis.exceptions.RedisError, ConnectionError):
        logger.warning('auth.refresh_ledger_failed jti=%s', jti[:8] if jti else None)
        if _redis_ever_connected:
            return False
        return True
