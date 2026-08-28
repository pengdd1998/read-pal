"""Daily LLM call budget per user — Redis-backed counter that resets at UTC midnight.

Distinct from rate limiting: a per-minute cap (rate_limiter.py) limits burst
load; this daily budget caps total LLM cost per user per day. Without it, a
motivated user can sustain ~190 LLM calls/min combined across routes
(chat + agent + heavy), which is non-trivial GLM cost at scale.

P3.2 added a token-aware path on top: ``check_and_charge_tokens`` /
``settle_tokens`` let the gateway pre-charge an estimated token count and
settle with the actual count after the vendor returns usage metadata.
When ``llm_daily_token_budget`` is 0, the token path is a no-op.

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
from app.utils.request_identity import jwt_user_id

logger = logging.getLogger('read-pal.daily-budget')

BUDGET_PREFIX = 'llm_budget:'
TOKEN_BUDGET_PREFIX = 'llm_token_budget:'
# TTL covers UTC day rollover + clock-skew buffer. Used for both call and
# token counters — duplicated 36h literal removed in P4.4.
_KEY_TTL_SECONDS = 36 * 3600


def _today_utc() -> str:
    """Stable UTC date string for budget keys.

    P4.4: extracted from three duplicated ``datetime.now(timezone.utc).strftime('%Y-%m-%d')``
    call sites. Keeping the date format in one place means a future change
    (e.g. weekly buckets) is a 1-line edit, not 3.
    """
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


class DailyLLMBudget:
    """Redis-backed daily LLM call + token budget per user."""

    def __init__(self) -> None:
        self.redis: aioredis.Redis = get_redis()

    async def check_and_increment(
        self, user_id: str, limit: int,
    ) -> tuple[bool, int, int]:
        """Atomically increment and check the daily counter.

        Returns ``(allowed, current_count, limit)``. Fail-open on Redis errors.
        """
        today = _today_utc()
        key = f'{BUDGET_PREFIX}{user_id}:{today}'
        try:
            count = await self.redis.incr(key)
            if count == 1:
                # TTL: 36h covers UTC day rollover + buffer for clock skew.
                await self.redis.expire(key, _KEY_TTL_SECONDS)
            return count <= limit, count, limit
        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('daily_budget.redis_failed user=%s', user_id)
            return True, 0, limit

    async def check_and_charge_tokens(
        self, user_id: str, tokens: int, limit: int,
    ) -> tuple[bool, int, int]:
        """Atomically pre-charge ``tokens`` against the daily token budget.

        Returns ``(allowed, current_total_after_charge, limit)``. Fail-open
        on Redis errors. ``tokens`` is the pre-charge estimate (chars/4 on
        input messages + reserved output); call :meth:`settle_tokens` after
        the vendor returns actual usage to true-up the difference.
        """
        if tokens <= 0:
            return True, 0, limit
        today = _today_utc()
        key = f'{TOKEN_BUDGET_PREFIX}{user_id}:{today}'
        try:
            new_total = await self.redis.incrby(key, tokens)
            # Set TTL on first charge of the day
            if new_total == tokens:
                await self.redis.expire(key, _KEY_TTL_SECONDS)
            return new_total <= limit, new_total, limit
        except (redis.exceptions.RedisError, ConnectionError):
            logger.warning('daily_token_budget.redis_failed user=%s', user_id)
            return True, 0, limit

    async def settle_tokens(
        self, user_id: str, pre_charge: int, actual: int,
    ) -> None:
        """Adjust the token counter post-call.

        ``actual`` is the real total tokens from the vendor response.
        ``pre_charge`` is what we estimated beforehand. INCRBY the signed
        difference (positive if we under-estimated, negative if we
        over-estimated).
        """
        delta = actual - pre_charge
        if delta == 0:
            return
        today = _today_utc()
        key = f'{TOKEN_BUDGET_PREFIX}{user_id}:{today}'
        try:
            # Redis INCRBY supports negative values for decrement
            await self.redis.incrby(key, delta)
        except (redis.exceptions.RedisError, ConnectionError):
            # Settle failure is non-fatal — pre-charge is conservative enough.
            logger.debug('daily_token_budget.settle_failed user=%s', user_id)


_budget: DailyLLMBudget | None = None


def _get_budget() -> DailyLLMBudget:
    global _budget
    if _budget is None:
        _budget = DailyLLMBudget()
    return _budget


def estimate_input_tokens(messages: list) -> int:
    """Heuristic char/4 estimate of input tokens across all messages.

    Used for pre-charge before the vendor returns actual usage. CJK is
    undercounted ~2x but that's acceptable for budgeting — better to
    under-charge and settle than block legitimate requests.
    """
    total_chars = 0
    for msg in messages:
        content = getattr(msg, 'content', None) or ''
        if isinstance(content, str):
            total_chars += len(content)
        elif isinstance(content, list):
            # langchain tool/vision chunks
            for part in content:
                if isinstance(part, dict):
                    total_chars += len(part.get('text', ''))
    return max(total_chars // 4, 1)


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

    # ``request.state.user`` is never set (get_current_user does not populate
    # it and runs after this dependency anyway) — verify the JWT directly.
    user_id = jwt_user_id(request)
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
