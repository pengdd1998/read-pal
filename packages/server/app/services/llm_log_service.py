"""LLM log persistence — fire-and-forget DB writes + query helpers."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import async_session
from app.models.llm_log import LLMLog

logger = logging.getLogger('read-pal.llm_log')


def fire_and_forget_log(
    *,
    request_id: str,
    model: str,
    label: str,
    latency_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    estimated_cost: float | None = None,
    success: bool = True,
    error_message: str | None = None,
    is_fallback: bool = False,
    user_id: UUID | str | None = None,
    book_id: UUID | str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Persist an LLM log entry via fire-and-forget (no await needed at call site)."""
    if not get_settings().llm_log_enabled:
        return
    try:
        import asyncio

        async def _write() -> None:
            async with async_session() as session:
                log = LLMLog(
                    user_id=UUID(str(user_id)) if user_id else None,
                    book_id=UUID(str(book_id)) if book_id else None,
                    request_id=request_id,
                    model=model,
                    label=label,
                    latency_ms=latency_ms,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=total_tokens,
                    estimated_cost=Decimal(str(estimated_cost)) if estimated_cost else None,
                    success=success,
                    error_message=error_message,
                    is_fallback=is_fallback,
                    extra=extra,
                )
                session.add(log)
                await session.commit()

        loop = asyncio.get_running_loop()
        loop.create_task(_write())
    except Exception as exc:
        logger.warning('fire_and_forget_log failed (non-critical)', exc_info=True)


async def get_llm_logs(
    db: AsyncSession,
    user_id: UUID,
    *,
    model: str | None = None,
    label: str | None = None,
    success: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[LLMLog], int]:
    """Return paginated LLM logs with optional filters."""
    conditions = [LLMLog.user_id == user_id]
    if model:
        conditions.append(LLMLog.model == model)
    if label:
        conditions.append(LLMLog.label == label)
    if success is not None:
        conditions.append(LLMLog.success == success)
    if date_from:
        conditions.append(LLMLog.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        conditions.append(LLMLog.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))

    where = and_(*conditions)
    total = await db.scalar(select(func.count(LLMLog.id)).where(where))
    rows = await db.execute(
        select(LLMLog)
        .where(where)
        .order_by(LLMLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return list(rows.scalars().all()), total or 0


async def get_llm_log_by_id(db: AsyncSession, user_id: UUID, log_id: UUID) -> LLMLog | None:
    """Return a single LLM log entry."""
    result = await db.execute(
        select(LLMLog).where(LLMLog.id == log_id, LLMLog.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _aggregate_by_model(
    db: AsyncSession,
    user_id: UUID,
    since: datetime,
) -> list[dict[str, Any]]:
    """Aggregate LLM usage grouped by model."""
    rows = await db.execute(
        select(
            LLMLog.model,
            func.count(LLMLog.id).label('calls'),
            func.coalesce(func.sum(LLMLog.prompt_tokens), 0).label('prompt_tokens'),
            func.coalesce(func.sum(LLMLog.completion_tokens), 0).label('completion_tokens'),
            func.coalesce(func.sum(LLMLog.total_tokens), 0).label('total_tokens'),
            func.coalesce(func.sum(LLMLog.estimated_cost), 0).label('total_cost'),
            func.avg(LLMLog.latency_ms).label('avg_latency_ms'),
        )
        .where(and_(LLMLog.user_id == user_id, LLMLog.created_at >= since))
        .group_by(LLMLog.model)
    )
    return [
        {
            'model': row.model,
            'calls': int(row.calls),
            'promptTokens': int(row.prompt_tokens),
            'completionTokens': int(row.completion_tokens),
            'totalTokens': int(row.total_tokens),
            'totalCost': float(row.total_cost or 0),
            'avgLatencyMs': round(float(row.avg_latency_ms or 0), 1),
        }
        for row in rows.all()
    ]


async def _aggregate_by_label(
    db: AsyncSession,
    user_id: UUID,
    since: datetime,
) -> list[dict[str, Any]]:
    """Aggregate LLM usage grouped by label."""
    rows = await db.execute(
        select(
            LLMLog.label,
            func.count(LLMLog.id).label('calls'),
            func.coalesce(func.sum(LLMLog.total_tokens), 0).label('total_tokens'),
        )
        .where(and_(LLMLog.user_id == user_id, LLMLog.created_at >= since))
        .group_by(LLMLog.label)
    )
    return [
        {
            'label': row.label,
            'calls': int(row.calls),
            'totalTokens': int(row.total_tokens),
        }
        for row in rows.all()
    ]


async def get_usage_summary(
    db: AsyncSession,
    user_id: UUID,
    days: int = 30,
) -> dict[str, Any]:
    """Return aggregated usage stats over the last N days."""
    since = datetime.now(tz=timezone.utc) - timedelta(days=days)
    by_model = await _aggregate_by_model(db, user_id, since)
    by_label = await _aggregate_by_label(db, user_id, since)
    return {
        'period': f'{days}d',
        'byModel': by_model,
        'byLabel': by_label,
    }


async def cleanup_old_logs(db: AsyncSession, retention_days: int) -> int:
    """Delete LLM logs older than retention_days. Returns count deleted."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        delete(LLMLog).where(LLMLog.created_at < cutoff).returning(LLMLog.id)
    )
    deleted = len(result.all())
    await db.flush()
    return deleted
