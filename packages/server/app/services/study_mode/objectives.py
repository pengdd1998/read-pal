"""Study mode objectives and concept checks — LLM-powered generation."""

from __future__ import annotations

import structlog
import time
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import (
    STUDY_CONCEPT_CHECKS_HUMAN,
    STUDY_CONCEPT_CHECKS_SYSTEM,
    STUDY_OBJECTIVES_HUMAN,
    STUDY_OBJECTIVES_SYSTEM,
)
from app.schemas.llm_outputs import ConceptCheckList, StudyObjectiveList
from app.services.llm import safe_llm_invoke
from app.services.study_mode.helpers import _extract_items, _generic_checks, _generic_objectives
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.study_mode')


def _build_objectives_messages(
    chapter_title: str,
    chapter_index: int | None,
    chapter_content: str,
) -> list:
    """Build system + human messages with token budgeting for objectives."""
    safe_title = sanitize_user_input(
        chapter_title, max_length=500, context='chapter_title',
    )

    budget = TokenBudget()

    system_text = STUDY_OBJECTIVES_SYSTEM.template
    budget.add(system_text, label='study-objectives-system')

    human_text = STUDY_OBJECTIVES_HUMAN.template.format(
        chapter_index=chapter_index or 1,
        chapter_title=safe_title,
    )

    if chapter_content:
        safe_content = sanitize_user_input(
            chapter_content[:1000],
            max_length=1000,
            context='chapter_content',
        )
        content_hint = f'\n\nChapter excerpt (first 1000 chars):\n{safe_content}'
        human_text = f'{human_text}{content_hint}'

    human_text = budget.add(human_text, label='study-objectives-human')

    if budget.truncations:
        logger.warning(
            'study_objectives_token_budget_truncated',
            truncations=', '.join(budget.truncations),
        )

    return [SystemMessage(content=system_text), HumanMessage(content=human_text)]


async def _invoke_objectives_llm(
    messages: list,
    chapter_title: str,
    book_id: str | None,
    user_id: UUID | None,
) -> list[dict[str, Any]]:
    """Call LLM for objectives and fall back to generics on failure."""
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='study-objectives',
        schema_class=StudyObjectiveList,
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
    )

    objectives = _extract_items(result, 'objectives')
    if not objectives:
        return _generic_objectives(chapter_title)
    return objectives


async def generate_objectives(
    book_id: str | None,
    chapter_title: str,
    chapter_index: int | None,
    chapter_content: str = '',
    user_id: UUID | None = None,
) -> dict[str, Any]:
    """Generate study objectives for a chapter using LLM."""
    t0 = time.monotonic()
    logger.info(
        'study_mode.generate_objectives.started',
        book_id=str(book_id) if book_id else None,
        chapter_title=chapter_title,
        chapter_index=chapter_index,
    )

    messages = _build_objectives_messages(
        chapter_title, chapter_index, chapter_content,
    )
    objectives = await _invoke_objectives_llm(
        messages, chapter_title, book_id, user_id,
    )

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        'study_mode.generate_objectives.completed',
        chapter_title=chapter_title,
        objective_count=len(objectives),
        latency_ms=round(elapsed, 1),
    )

    return {
        'bookId': str(book_id) if book_id else None,
        'objectives': objectives,
    }


def _build_checks_messages(
    chapter_title: str,
    chapter_index: int | None,
    chapter_content: str,
) -> list:
    """Build system + human messages with token budgeting for concept checks."""
    safe_title = sanitize_user_input(chapter_title, max_length=500, context='chapter_title')
    safe_content = sanitize_user_input(
        chapter_content[:2000] if chapter_content else '',
        max_length=2000,
        context='chapter_content',
    )

    budget = TokenBudget()

    content_hint = ''
    if safe_content:
        content_hint = f'\n\nChapter excerpt (first 2000 chars):\n{safe_content}'

    system_text = STUDY_CONCEPT_CHECKS_SYSTEM.template
    budget.add(system_text, label='study-concept-checks-system')

    human_text = STUDY_CONCEPT_CHECKS_HUMAN.template.format(
        chapter_index=chapter_index or 1,
        chapter_title=safe_title,
        content_hint=content_hint,
    )
    human_text = budget.add(human_text, label='study-concept-checks-human')

    if budget.truncations:
        logger.warning(
            'study_concept_checks_token_budget_truncated',
            truncations=', '.join(budget.truncations),
        )

    return [SystemMessage(content=system_text), HumanMessage(content=human_text)]


async def _invoke_checks_llm(
    messages: list,
    chapter_title: str,
    book_id: str | None,
    user_id: UUID | None,
) -> list[dict[str, Any]]:
    """Call LLM for concept checks and fall back to generics on failure."""
    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='study-concept-checks',
        schema_class=ConceptCheckList,
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
    )

    checks = _extract_items(result, 'checks')
    if not checks:
        return _generic_checks(chapter_title)
    return checks


async def generate_concept_checks(
    book_id: str | None,
    chapter_title: str,
    chapter_index: int | None,
    chapter_content: str,
    user_id: UUID | None = None,
) -> dict[str, Any]:
    """Generate concept check questions with answers and hints."""
    t0 = time.monotonic()
    logger.info(
        'study_mode.generate_concept_checks.started',
        book_id=str(book_id) if book_id else None,
        chapter_title=chapter_title,
        chapter_index=chapter_index,
    )

    messages = _build_checks_messages(chapter_title, chapter_index, chapter_content)
    checks = await _invoke_checks_llm(messages, chapter_title, book_id, user_id)

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        'study_mode.generate_concept_checks.completed',
        chapter_title=chapter_title,
        check_count=len(checks),
        latency_ms=round(elapsed, 1),
    )

    return {
        'bookId': str(book_id) if book_id else None,
        'checks': checks,
    }
