"""H5a (P-H): platform usage / quota snapshot for the ops overview.

The original design pointed at a Zhipu balance API — live-verified 404 on
every candidate path (2026-09-26, real key, from the VPS), so this card
runs on data we actually own: today's platform-wide call/token/cost
aggregates from ``llm_call_traces``, a day-over-day delta, and the top
per-user consumers (8-hex digests, same convention as trace_queries).
An optional soft cost budget (``llm_ops_daily_cost_budget_usd``) drives a
progress bar; 0 hides it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_trace import LLMCallTrace


def _day_floor(now: datetime, days_back: int = 0) -> datetime:
    """UTC-midnight bucket, timezone-aware (created_at is DateTime(tz=True)
    and existing trace queries compare against aware UTC datetimes)."""
    day = (now.astimezone(UTC) - timedelta(days=days_back)).date()
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


async def _window_totals(db: AsyncSession, start: datetime, end: datetime) -> dict[str, float]:
    row = (await db.execute(
        select(
            func.count(LLMCallTrace.id),
            func.coalesce(func.sum(LLMCallTrace.total_tokens), 0),
            func.coalesce(func.sum(LLMCallTrace.estimated_cost_usd), 0.0),
        ).where(
            LLMCallTrace.created_at >= start,
            LLMCallTrace.created_at < end,
            LLMCallTrace.cache_hit.is_(False),
        ),
    )).one()
    return {'calls': row[0] or 0, 'tokens': row[1] or 0, 'cost_usd': float(row[2] or 0.0)}


async def _top_users_today(db: AsyncSession, start: datetime, end: datetime, limit: int = 5) -> list[dict[str, Any]]:
    import hashlib

    rows = (await db.execute(
        select(
            LLMCallTrace.user_id,
            func.count(LLMCallTrace.id),
            func.coalesce(func.sum(LLMCallTrace.total_tokens), 0),
        ).where(
            LLMCallTrace.created_at >= start,
            LLMCallTrace.created_at < end,
            LLMCallTrace.cache_hit.is_(False),
            LLMCallTrace.user_id.isnot(None),
        ).group_by(LLMCallTrace.user_id).order_by(func.sum(LLMCallTrace.total_tokens).desc()).limit(limit),
    )).all()
    return [
        {
            'user': hashlib.sha256(str(r[0]).encode()).hexdigest()[:8],
            'calls': r[1],
            'tokens': r[2] or 0,
        }
        for r in rows
    ]


async def platform_quota_snapshot(db: AsyncSession) -> dict[str, Any]:
    """Today vs yesterday platform aggregates + top consumers (ops-only)."""
    from app.config import get_settings

    now = datetime.now(UTC)
    today_start = _day_floor(now)
    yesterday_start = _day_floor(now, days_back=1)

    today = await _window_totals(db, today_start, now)
    yesterday = await _window_totals(db, yesterday_start, today_start)
    top_users = await _top_users_today(db, today_start, now)

    budget = float(getattr(get_settings(), 'llm_ops_daily_cost_budget_usd', 0.0) or 0.0)
    return {
        'today': today,
        'yesterday': yesterday,
        'top_users_today': top_users,
        'cost_budget_usd': budget,
        'budget_used_ratio': (today['cost_usd'] / budget) if budget > 0 else None,
    }
