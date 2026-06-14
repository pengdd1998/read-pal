"""Account lockout after failed login attempts.

Mirrors the Node.js lockout logic exactly:
  - Tracks failed attempts per email in Redis
  - Locks account after 10 consecutive failures
  - Lockout duration: 15 minutes
  - Clears on successful login
"""

import json
import logging
import time

import redis.asyncio as aioredis
import redis.exceptions

from app.core.redis import get_redis

logger = logging.getLogger('read-pal.lockout')

LOCKOUT_PREFIX = 'auth:lockout:'
MAX_FAILED_ATTEMPTS = 10
LOCKOUT_DURATION = 15 * 60  # 15 minutes in seconds


class LoginLockout:
    """Redis-backed account lockout tracker."""

    def __init__(self) -> None:
        self.redis: aioredis.Redis = get_redis()
        # Track whether we've ever successfully reached Redis. Drives the
        # fail-closed behavior in check_lockout — see comment there.
        self._ever_connected: bool = False

    async def check_lockout(self, email: str) -> tuple[bool, int | None]:
        """Check whether an email is currently locked out.

        Returns ``(is_locked, minutes_remaining)``.

        Fail-closed: if Redis was previously reachable but now errors, return
        ``(True, LOCKOUT_DURATION // 60)`` rather than silently letting a
        possibly-locked account through. The cold-start window (Redis never
        connected) stays fail-open to tolerate dev setups without Redis.
        """
        try:
            data = await self.redis.get(f'{LOCKOUT_PREFIX}{email}')
            self._ever_connected = True
            if not data:
                return False, None

            entry = json.loads(data)
            locked_until = entry.get('lockedUntil', 0)
            now = int(time.time() * 1000)

            if locked_until and now < locked_until:
                remaining_ms = locked_until - now
                return True, max(1, (remaining_ms + 59_999) // 60_000)

            # Lockout has expired — clean up
            await self.redis.delete(f'{LOCKOUT_PREFIX}{email}')
            return False, None

        except (redis.exceptions.RedisError, json.JSONDecodeError, ConnectionError):
            logger.warning('Redis unavailable — cannot check lockout for %s', email)
            if self._ever_connected:
                # Treat as locked — refuse the login rather than permit brute force.
                return True, LOCKOUT_DURATION // 60
            return False, None

    async def record_failed_login(self, email: str) -> None:
        """Increment failed login count and lock if threshold reached."""
        try:
            key = f'{LOCKOUT_PREFIX}{email}'
            data = await self.redis.get(key)
            self._ever_connected = True

            if data:
                entry = json.loads(data)
            else:
                entry = {'count': 0, 'lockedUntil': 0}

            entry['count'] += 1

            if entry['count'] >= MAX_FAILED_ATTEMPTS:
                entry['lockedUntil'] = int(time.time() * 1000) + LOCKOUT_DURATION * 1000

            # Auto-expire after lockout duration plus buffer
            await self.redis.set(
                key,
                json.dumps(entry),
                ex=LOCKOUT_DURATION + 60,
            )

        except (redis.exceptions.RedisError, json.JSONDecodeError, ConnectionError):
            logger.warning('Redis unavailable — cannot record failed login for %s', email)

    async def clear_failed_logins(self, email: str) -> None:
        """Delete the lockout key on successful login."""
        try:
            await self.redis.delete(f'{LOCKOUT_PREFIX}{email}')
            self._ever_connected = True
        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('Redis unavailable — cannot clear lockout for %s', email)


# --- Lazy singleton -----------------------------------------------------------

_lockout: LoginLockout | None = None


def get_login_lockout() -> LoginLockout:
    """Return the shared LoginLockout instance."""
    global _lockout
    if _lockout is None:
        _lockout = LoginLockout()
    return _lockout
