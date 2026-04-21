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

from app.core.redis import get_redis
from app.config import get_settings

logger = logging.getLogger('read-pal.lockout')

LOCKOUT_PREFIX = 'auth:lockout:'
MAX_FAILED_ATTEMPTS = 10
LOCKOUT_DURATION = 15 * 60  # 15 minutes in seconds


class LoginLockout:
    """Redis-backed account lockout tracker."""

    def __init__(self) -> None:
        self.redis: aioredis.Redis = get_redis()

    async def check_lockout(self, email: str) -> tuple[bool, int | None]:
        """Check whether an email is currently locked out.

        Returns ``(is_locked, minutes_remaining)``.
        """
        try:
            data = await self.redis.get(f'{LOCKOUT_PREFIX}{email}')
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

        except Exception:
            logger.debug('Redis unavailable — cannot check lockout for %s', email)
            return False, None

    async def record_failed_login(self, email: str) -> None:
        """Increment failed login count and lock if threshold reached."""
        try:
            key = f'{LOCKOUT_PREFIX}{email}'
            data = await self.redis.get(key)

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

        except Exception:
            logger.debug('Redis unavailable — cannot record failed login for %s', email)

    async def clear_failed_logins(self, email: str) -> None:
        """Delete the lockout key on successful login."""
        try:
            await self.redis.delete(f'{LOCKOUT_PREFIX}{email}')
        except Exception:
            logger.debug('Redis unavailable — cannot clear lockout for %s', email)


# --- Lazy singleton -----------------------------------------------------------

_lockout: LoginLockout | None = None


def get_login_lockout() -> LoginLockout:
    """Return the shared LoginLockout instance."""
    global _lockout
    if _lockout is None:
        _lockout = LoginLockout()
    return _lockout
