"""LLM prompt building and plan text generation for reading plans."""

from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.models.book import Book
from app.prompts import READING_PLAN_HUMAN, READING_PLAN_SYSTEM
from app.services.llm import safe_llm_call
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.reading_plan')


def build_plan_prompts(
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


def build_fallback_plan(
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


async def generate_plan_text(
    book: Book,
    total_days: int,
    daily_minutes: int,
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> str:
    """Use LLM to generate a structured reading plan."""
    system_prompt, human_prompt, current, pages_per_day, pages = (
        build_plan_prompts(book, total_days, daily_minutes)
    )
    fallback_plan = build_fallback_plan(
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
