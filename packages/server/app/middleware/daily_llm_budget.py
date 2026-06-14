"""Daily LLM call budget per user — Redis-backed counter that resets at UTC midnight.

Distinct from rate limiting: a per-minute cap (rate_limiter.py) limits burst
load; this daily budget caps total LLM cost per user per day. Without it, a
motivated user can sustain ~190 LLM calls/min combined across routes
(chat + agent + heavy), which is non-trivial GLM cost at scale.

Fail-open on Redis errors: we prefer to allow occasional overage during an
outage over blocking all AI features. The per-route rate limiters still bound
burst load.
"""

import logging
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
import redis.exceptions
from fastapi import Depends, HTTPException, Request, status

from app.config import get_settings
from app.core.redis import get_redis
from app.utils.i18n import t

logger = logging.getLogger('read-pal.daily-budget')

BUDGET_PREFIX = 'llm_budget:'


class DailyLLMBudget:
    """Redis-backed daily LLM call budget per user."""

    def __init__(self) -> None:
        self.redis: aioredis.Redis = get_redis()

    async def check_and_increment(
        self, user_id: str, limit: int,
    ) -> tuple[bool, int, int]:
        """Atomically increment and check the daily counter.

        Returns ``(allowed, current_count, limit)``. Fail-open on Redis errors.
        """
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        key = f'{BUDGET_PREFIX}{user_id}:{today}'
        try:
            count = await self.redis.incr(key)
            if count == 1:
                # TTL: 36h covers UTC day rollover + buffer for clock skew.
                await self.redis.expire(key, 36 * 3600)
            return count <= limit, count, limit
        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('daily_budget.redis_failed user=%s', user_id)
            return True, 0, limit


_budget: DailyLLMBudget | None = None


def _get_budget() -> DailyLLMBudget:
    global _budget
    if _budget is None:
        _budget = DailyLLMBudget()
    return _budget


def _has_i18n_key(key: str) -> bool:
    """Lightweight i18n key existence check (avoids surfacing raw key to user)."""
    try:
        value = t(key)
        return value != key and bool(value)
    except Exception:
        return False


async def enforce_daily_llm_budget(request: Request) -> None:
    """FastAPI dependency: enforce the daily LLM budget per authenticated user.

    Apply via ``Depends(enforce_daily_llm_budget)`` on LLM-backed routes.
    No-op when ``llm_daily_budget == 0`` (disabled — default for dev/test).
    """
    settings = get_settings()
    if settings.llm_daily_budget <= 0:
        return  # Budget disabled — skip entirely.

    user = getattr(request.state, 'user', None) or {}
    user_id = user.get('id') or user.get('sub')
    if not user_id:
        # Anonymous — auth middleware will reject upstream; nothing to budget.
        return

    limit = settings.llm_daily_budget
    budget = _get_budget()
    allowed, count, _ = await budget.check_and_increment(str(user_id), limit)

    if not allowed:
        # Reset time = next UTC midnight.
        now = datetime.now(timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0,
        )
        retry_after = max(1, int((tomorrow - now).total_seconds()))
        message = (
            t('errors.daily_llm_budget_exceeded')
            if _has_i18n_key('errors.daily_llm_budget_exceeded')
            else f'Daily AI usage limit reached ({limit} calls). Try again tomorrow.'
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'code': 'DAILY_LLM_BUDGET_EXCEEDED',
                'message': message,
            },
            headers={
                'Retry-After': str(retry_after),
                'X-DailyLLM-Limit': str(limit),
                'X-DailyLLM-Remaining': '0',
            },
        )


# Pre-configured dependency instances for common cases
daily_ai_budget = Depends(enforce_daily_llm_budget)
