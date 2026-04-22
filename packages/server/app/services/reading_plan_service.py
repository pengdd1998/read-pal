"""Reading plan service — AI-generated reading schedules."""

import logging
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

logger = logging.getLogger('read-pal.reading_plan')


async def generate_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    total_days: int = 7,
    daily_minutes: int = 30,
) -> dict[str, Any]:
    """Generate or regenerate a reading plan for a book."""
    book = await _load_book(db, user_id, book_id)

    # Check for existing active plan
    existing = await _get_active_plan(db, user_id, book_id)
    if existing:
        # Deactivate old plan
        existing.is_active = False
        await db.flush()

    # Generate plan via LLM
    plan_text = await _generate_plan_text(book, total_days, daily_minutes)

    # Save to DB
    plan = ReadingPlan(
        user_id=user_id,
        book_id=book_id,
        plan_text=plan_text,
        total_days=total_days,
    )
    db.add(plan)
    await db.flush()

    return {
        'id': str(plan.id),
        'book_id': str(book_id),
        'plan_text': plan_text,
        'total_days': total_days,
        'current_day': 1,
        'is_active': True,
    }


async def get_active_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Get the active reading plan for a book."""
    plan = await _get_active_plan(db, user_id, book_id)
    if not plan:
        return None
    return {
        'id': str(plan.id),
        'book_id': str(plan.book_id),
        'plan_text': plan.plan_text,
        'total_days': plan.total_days,
        'current_day': plan.current_day,
        'is_active': plan.is_active,
    }


async def advance_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Mark current day as complete and advance to next day."""
    plan = await _get_active_plan(db, user_id, book_id)
    if not plan:
        return None

    plan.current_day = min(plan.current_day + 1, plan.total_days)
    if plan.current_day >= plan.total_days:
        plan.is_active = False
    await db.flush()

    return {
        'id': str(plan.id),
        'current_day': plan.current_day,
        'total_days': plan.total_days,
        'is_active': plan.is_active,
    }


async def _load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book:
    result = await db.execute(
        select(Book).where(Book.id == book_id, Book.user_id == user_id)
    )
    book = result.scalar_one_or_none()
    if book is None:
        raise ValueError(f'Book {book_id} not found for user {user_id}')
    return book


async def _get_active_plan(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> ReadingPlan | None:
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


async def _generate_plan_text(
    book: Book,
    total_days: int,
    daily_minutes: int,
) -> str:
    """Use LLM to generate a structured reading plan."""
    pages = book.total_pages or 0
    current = book.current_page or 0
    remaining = max(0, pages - current)
    pages_per_day = remaining // total_days if total_days > 0 else remaining

    # Centralized prompt templates (versioned, trackable)
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

    # Token budget: ensure prompts fit within context window
    budget = TokenBudget()
    budget.add(system_prompt, label='reading_plan_system')
    budget.add(human_prompt, label='reading_plan_human')

    if budget.truncations:
        logger.warning(
            'Reading plan prompts truncated: %s (used %d tokens)',
            ', '.join(budget.truncations),
            budget.used,
        )

    # Build fallback text plan
    lines = [f'{total_days}-Day Reading Plan for "{book.title}"\n']
    for day in range(1, total_days + 1):
        start = current + (day - 1) * pages_per_day
        end = min(start + pages_per_day, pages)
        lines.append(
            f'Day {day}: Pages {start}-{end}\n'
            f'  - Focus: Read carefully and note key ideas\n'
            f'  - Question: What surprised you in this section?'
        )
    fallback_plan = '\n\n'.join(lines)

    result = await safe_llm_call(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=fallback_plan,
        log_label='Reading plan',
    )
    return result if result else fallback_plan
