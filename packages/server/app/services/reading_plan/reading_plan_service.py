"""Reading plan service — AI-generated reading schedules."""

import structlog
import time
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.reading_plan import ReadingPlan
from app.services.reading_plan.plan_generation import generate_plan_text as _generate_plan_text
from app.utils.db import db_error_guard
from app.utils.i18n import t

logger = structlog.get_logger('read-pal.reading_plan')


async def _deactivate_existing_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Deactivate any existing active plan for this user/book."""
    async with db_error_guard('_deactivate_existing_plan', book_id=str(book_id), user_id=str(user_id)):
        existing = await _get_active_plan(db, user_id, book_id)
        if existing:
            existing.is_active = False
            await db.flush()


async def _save_new_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    plan_text: str,
    total_days: int,
) -> ReadingPlan | None:
    """Persist a new reading plan and return it."""
    try:
        async with db_error_guard('_save_new_plan', book_id=str(book_id), user_id=str(user_id)):
            plan = ReadingPlan(
                user_id=user_id,
                book_id=book_id,
                plan_text=plan_text,
                total_days=total_days,
            )
            db.add(plan)
            await db.flush()
            return plan
    except (DBAPIError, OSError):
        logger.debug('reading plan query failed', exc_info=True)
        return None


def _format_plan_response(
    plan: ReadingPlan,
    book_id: UUID,
    plan_text: str,
    total_days: int,
) -> dict[str, Any]:
    """Build the API response dict for a reading plan."""
    return {
        'id': str(plan.id),
        'bookId': str(book_id),
        'planText': plan_text,
        'totalDays': total_days,
        'currentDay': 1,
        'isActive': True,
    }


async def generate_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    total_days: int = 7,
    daily_minutes: int = 30,
) -> dict[str, Any]:
    """Generate or regenerate a reading plan for a book."""
    total_days = max(1, min(total_days, 90))
    daily_minutes = max(10, min(daily_minutes, 240))
    t0 = time.monotonic()
    logger.info(
        'reading_plan.generate.started',
        book_id=str(book_id),
        user_id=str(user_id),
        total_days=total_days,
        daily_minutes=daily_minutes,
    )

    book = await _load_book(db, user_id, book_id)
    if book is None:
        raise ValueError(t('errors.book_not_found_id', book_id=str(book_id)))
    await _deactivate_existing_plan(db, user_id, book_id)

    # Generate plan via LLM
    plan_text = await _generate_plan_text(
        book, total_days, daily_minutes,
        user_id=user_id, book_id=book_id,
    )

    plan = await _save_new_plan(db, user_id, book_id, plan_text, total_days)
    if plan is None:
        raise ValueError('Failed to save reading plan')

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        'reading_plan.generate.completed',
        plan_id=str(plan.id),
        book_id=str(book_id),
        total_days=total_days,
        latency_ms=round(elapsed, 1),
    )

    return _format_plan_response(plan, book_id, plan_text, total_days)


async def get_active_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Get the active reading plan for a book."""
    logger.info(
        'reading_plan.get_active.started',
        book_id=str(book_id),
        user_id=str(user_id),
    )

    plan = await _get_active_plan(db, user_id, book_id)
    if not plan:
        logger.info('reading_plan.get_active.completed', plan_found=False)
        return None

    logger.info(
        'reading_plan.get_active.completed',
        plan_found=True,
        plan_id=str(plan.id),
        current_day=plan.current_day,
    )
    return {
        'id': str(plan.id),
        'bookId': str(plan.book_id),
        'planText': plan.plan_text,
        'totalDays': plan.total_days,
        'currentDay': plan.current_day,
        'isActive': plan.is_active,
    }


async def advance_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Mark current day as complete and advance to next day."""
    logger.info(
        'reading_plan.advance.started',
        book_id=str(book_id),
        user_id=str(user_id),
    )

    plan = await _get_active_plan(db, user_id, book_id)
    if not plan:
        logger.info('reading_plan.advance.completed', plan_found=False)
        return None

    plan.current_day = min(plan.current_day + 1, plan.total_days)
    if plan.current_day >= plan.total_days:
        plan.is_active = False
    await db.flush()

    logger.info(
        'reading_plan.advance.completed',
        plan_id=str(plan.id),
        day_completed=plan.current_day,
        plan_finished=not plan.is_active,
    )

    return {
        'id': str(plan.id),
        'currentDay': plan.current_day,
        'totalDays': plan.total_days,
        'isActive': plan.is_active,
    }


async def _load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book | None:
    async with db_error_guard('_load_book', book_id=str(book_id), user_id=str(user_id)):
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id)
        )
    book = result.scalar_one_or_none()
    if book is None:
        raise ValueError(t('errors.book_not_found_user', book_id=str(book_id), user_id=str(user_id)))
    return book


async def _get_active_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> ReadingPlan | None:
    try:
        async with db_error_guard('_get_active_plan', book_id=str(book_id), user_id=str(user_id)):
            result = await db.execute(
                select(ReadingPlan)
                .where(
                    ReadingPlan.user_id == user_id,
                    ReadingPlan.book_id == book_id,
                    ReadingPlan.is_active == True,  # noqa: E712
                )
                .order_by(ReadingPlan.created_at.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()
    except (DBAPIError, OSError):
        logger.debug('reading plan query failed', exc_info=True)
        return None
