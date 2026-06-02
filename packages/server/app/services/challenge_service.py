"""Challenge business logic — reading challenge progress computation.

No LLM/AI calls -- progress is computed directly from the database.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book, BookStatus
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession

logger = logging.getLogger('read-pal.challenges')
from app.utils import utcnow


def _utc_now() -> datetime:
    return utcnow()


def _start_of_week() -> datetime:
    """Return Monday 00:00 of the current week (UTC)."""
    now = _utc_now()
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_month() -> datetime:
    """Return the 1st of the current month 00:00 (UTC)."""
    now = _utc_now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _build_challenge(
    id: str,
    title: str,
    description: str,
    type: str,
    target: int,
    unit: str,
    icon: str,
    progress: int,
) -> dict:
    percentage = min(round(progress / target * 100), 100) if target > 0 else 0
    return {
        'id': id,
        'title': title,
        'description': description,
        'type': type,
        'target': target,
        'unit': unit,
        'icon': icon,
        'progress': progress,
        'completed': progress >= target,
        'percentage': percentage,
    }


async def get_daily_reading(
    db: AsyncSession, user_id: UUID,
) -> dict:
    today = _utc_now().date()
    result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.duration), 0)).where(
            and_(
                ReadingSession.user_id == user_id,
                func.date(ReadingSession.started_at) == today,
            ),
        ),
    )
    minutes = int(result.scalar() or 0)
    return _build_challenge(
        id='daily-reading',
        title='Daily Reading',
        description='Read for 30 minutes today to build your streak.',
        type='daily',
        target=30,
        unit='minutes',
        icon='\U0001f4da',
        progress=minutes,
    )


async def get_weekly_pages(
    db: AsyncSession, user_id: UUID,
) -> dict:
    week_start = _start_of_week()
    result = await db.execute(
        select(func.coalesce(func.sum(ReadingSession.pages_read), 0)).where(
            and_(
                ReadingSession.user_id == user_id,
                ReadingSession.started_at >= week_start,
            ),
        ),
    )
    pages = int(result.scalar() or 0)
    return _build_challenge(
        id='weekly-pages',
        title='Weekly Pages',
        description='Read 100 pages this week to stay on track.',
        type='weekly',
        target=100,
        unit='pages',
        icon='\U0001f4d6',
        progress=pages,
    )


async def get_highlight_streak(
    db: AsyncSession, user_id: UUID,
) -> dict:
    """Count consecutive days (ending today) with at least 1 highlight.

    Batch optimisation: single query fetches all highlights in the 7-day
    window, then we count per-day in Python instead of one query per day.
    """
    today = _utc_now().date()
    week_ago = today - timedelta(days=6)
    # Single query: all highlights in the 7-day date range
    result = await db.execute(
        select(func.date(Annotation.created_at), func.count()).where(
            and_(
                Annotation.user_id == user_id,
                Annotation.type == 'highlight',
                func.date(Annotation.created_at) >= week_ago,
                func.date(Annotation.created_at) <= today,
            ),
        ).group_by(func.date(Annotation.created_at)),
    )
    # Build a set of dates that have at least one highlight
    active_dates = {row[0] for row in result.all() if (row[1] or 0) > 0}
    # Walk backwards from today to count consecutive active days
    streak = 0
    for day_offset in range(7):
        day = today - timedelta(days=day_offset)
        if day in active_dates:
            streak += 1
        else:
            break
    return _build_challenge(
        id='highlight-streak',
        title='Highlight Streak',
        description='Make at least 1 highlight per day for 7 days straight.',
        type='daily',
        target=7,
        unit='days',
        icon='✍️',
        progress=streak,
    )


async def get_book_completion(
    db: AsyncSession, user_id: UUID,
) -> dict:
    """Find the book closest to completion and track its progress."""
    result = await db.execute(
        select(Book).where(
            and_(
                Book.user_id == user_id,
                Book.status == BookStatus.reading.value,
                Book.total_pages > 0,
            ),
        ).order_by(Book.progress.desc()).limit(1),
    )
    book = result.scalar_one_or_none()
    if book is None:
        return _build_challenge(
            id='book-completion',
            title='Finish a Book',
            description='Complete a book you are currently reading.',
            type='monthly',
            target=100,
            unit='percent',
            icon='\U0001f3c1',
            progress=0,
        )
    progress_pct = int(float(book.progress))
    return _build_challenge(
        id='book-completion',
        title=f'Finish "{book.title}"',
        description=f'You are {progress_pct}% through — keep going!',
        type='monthly',
        target=100,
        unit='percent',
        icon='\U0001f3c1',
        progress=progress_pct,
    )


async def get_flashcard_review(
    db: AsyncSession, user_id: UUID,
) -> dict:
    now = _utc_now()
    result = await db.execute(
        select(func.count()).select_from(Flashcard).where(
            and_(
                Flashcard.user_id == user_id,
                Flashcard.next_review_at <= now,
            ),
        ),
    )
    due_count = int(result.scalar() or 0)
    target = max(due_count, 10)
    if due_count == 0:
        return _build_challenge(
            id='flashcard-review',
            title='Flashcard Review',
            description='All caught up! No cards due for review right now.',
            type='daily',
            target=10,
            unit='cards',
            icon='\U0001f4dd',
            progress=10,
        )
    return _build_challenge(
        id='flashcard-review',
        title='Flashcard Review',
        description=f'You have {due_count} cards due — review them all!',
        type='daily',
        target=target,
        unit='cards',
        icon='\U0001f4dd',
        progress=0,
    )


async def get_monthly_books(
    db: AsyncSession, user_id: UUID,
) -> dict:
    month_start = _start_of_month()
    result = await db.execute(
        select(func.count()).select_from(Book).where(
            and_(
                Book.user_id == user_id,
                Book.started_at >= month_start,
            ),
        ),
    )
    started = int(result.scalar() or 0)
    return _build_challenge(
        id='monthly-books',
        title='Monthly Explorer',
        description='Start 3 new books this month to broaden your horizons.',
        type='monthly',
        target=3,
        unit='books',
        icon='\U0001f680',
        progress=started,
    )


async def get_all_challenges(
    db: AsyncSession, user_id: UUID,
) -> list[dict]:
    """Return all personalised reading challenges for a user (cached 5 min)."""
    from app.core.redis import get_redis

    cache_key = f'challenges:{user_id}'
    try:
        redis = get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception as exc:
        logger.debug('challenge_service.cache_read_miss', error=str(exc)[:200])

    result = list(await asyncio.gather(
        get_daily_reading(db, user_id),
        get_weekly_pages(db, user_id),
        get_highlight_streak(db, user_id),
        get_book_completion(db, user_id),
        get_flashcard_review(db, user_id),
        get_monthly_books(db, user_id),
    ))

    try:
        redis = get_redis()
        await redis.setex(cache_key, 300, json.dumps(result))
    except Exception as exc:
        logger.debug('challenge_service.cache_write_failed', error=str(exc)[:200])

    return result
