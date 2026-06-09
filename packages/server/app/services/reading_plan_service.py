"""Reading plan service — AI-generated reading schedules."""

import structlog
import time
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.reading_plan import ReadingPlan
from app.prompts import READING_PLAN_HUMAN, READING_PLAN_SYSTEM
from app.services.llm import safe_llm_call
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.reading_plan')


async def _deactivate_existing_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> None:
    """Deactivate any existing active plan for this user/book."""
    try:
        existing = await _get_active_plan(db, user_id, book_id)
        if existing:
            existing.is_active = False
            await db.flush()
    except Exception:
        logger.error('Failed to deactivate existing plan', exc_info=True, book_id=str(book_id), user_id=str(user_id))


async def _save_new_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    plan_text: str,
    total_days: int,
) -> ReadingPlan | None:
    """Persist a new reading plan and return it."""
    try:
        plan = ReadingPlan(
            user_id=user_id,
            book_id=book_id,
            plan_text=plan_text,
            total_days=total_days,
        )
        db.add(plan)
        await db.flush()
        return plan
    except Exception:
        logger.error('Failed to save new plan', exc_info=True, book_id=str(book_id), user_id=str(user_id))
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
        raise ValueError(f'Book {book_id} not found')
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
    try:
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id)
        )
        book = result.scalar_one_or_none()
        if book is None:
            raise ValueError(f'Book {book_id} not found for user {user_id}')
        return book
    except Exception:
        logger.error('Failed to load book', exc_info=True, book_id=str(book_id), user_id=str(user_id))
        return None


async def _get_active_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> ReadingPlan | None:
    try:
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
    except Exception:
        logger.error('Failed to get active plan', exc_info=True, book_id=str(book_id), user_id=str(user_id))
        return None


def _build_plan_prompts(
    book: Book,
    total_days: int,
    daily_minutes: int,
) -> tuple[str, str, int, int, int]:
    """Build system and human prompts for reading plan generation.

    Returns (system_prompt, human_prompt, current_page, pages_per_day, total_pages).
    """
    pages = book.total_pages or 0
    current = book.current_page or 0
    remaining = max(0, pages - current)
    pages_per_day = remaining // total_days if total_days > 0 else remaining

    system_prompt = READING_PLAN_SYSTEM.template
    human_prompt = READING_PLAN_HUMAN.template.format(
        total_days=total_days,
        title=book.title,
        author=book.author,
        pages=pages,
        current_page=current,
        remaining=remaining,
        pages_per_day=pages_per_day,
        daily_minutes=daily_minutes,
        progress=book.progress or 0,
    )

    budget = TokenBudget()
    budget.add(system_prompt, label='reading_plan_system')
    budget.add(human_prompt, label='reading_plan_human')

    if budget.truncations:
        logger.warning(
            'reading_plan_prompts_truncated',
            truncations=', '.join(budget.truncations),
            used_tokens=budget.used,
        )

    return system_prompt, human_prompt, current, pages_per_day, pages


def _build_fallback_plan(
    book: Book,
    total_days: int,
    current: int,
    pages_per_day: int,
    pages: int,
) -> str:
    """Build a simple text-based reading plan as LLM fallback."""
    lines = [f'{total_days}-Day Reading Plan for "{book.title}"\n']
    for day in range(1, total_days + 1):
        start = current + (day - 1) * pages_per_day
        end = min(start + pages_per_day, pages)
        lines.append(
            f'Day {day}: Pages {start}-{end}\n'
            f'  - Focus: Read carefully and note key ideas\n'
            f'  - Question: What surprised you in this section?'
        )
    return '\n\n'.join(lines)


async def _generate_plan_text(
    book: Book,
    total_days: int,
    daily_minutes: int,
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> str:
    """Use LLM to generate a structured reading plan."""
    system_prompt, human_prompt, current, pages_per_day, pages = (
        _build_plan_prompts(book, total_days, daily_minutes)
    )
    fallback_plan = _build_fallback_plan(
        book, total_days, current, pages_per_day, pages,
    )

    result = await safe_llm_call(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=fallback_plan,
        log_label='Reading plan',
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
    )
    return result if result else fallback_plan
