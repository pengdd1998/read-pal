"""Study mode service — objectives, concept checks, mastery tracking."""

from __future__ import annotations

import uuid
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.flashcard import Flashcard
from app.services.llm import safe_llm_invoke
from app.utils import utcnow
from app.utils.i18n import t


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generic_objectives(chapter_title: str) -> list[dict[str, Any]]:
    """Fallback objectives when LLM is unavailable."""
    return [
        {'id': str(uuid.uuid4()), 'text': f'Understand the key themes of "{chapter_title}"', 'completed': False},
        {'id': str(uuid.uuid4()), 'text': f'Identify the main ideas presented in "{chapter_title}"', 'completed': False},
        {'id': str(uuid.uuid4()), 'text': f'Summarize the key takeaways from "{chapter_title}"', 'completed': False},
    ]


def _generic_checks(chapter_title: str) -> list[dict[str, Any]]:
    """Fallback concept checks when LLM is unavailable."""
    positions = ['start', 'middle', 'end']
    return [
        {
            'id': str(uuid.uuid4()),
            'question': f'What is the central idea of "{chapter_title}"?',
            'hint': 'Think about the main argument or theme.',
            'answer': 'The central idea revolves around the key themes discussed in this chapter.',
            'position': positions[i % 3],
        }
        for i in range(3)
    ]


# ---------------------------------------------------------------------------
# Objectives
# ---------------------------------------------------------------------------

async def generate_objectives(
    book_id: str | None,
    chapter_title: str,
    chapter_index: int | None,
) -> dict[str, Any]:
    """Generate study objectives for a chapter using LLM."""
    messages = [
        SystemMessage(
            content=(
                'You are a study assistant. Generate 3-5 concise learning objectives '
                'for the given chapter. Return ONLY a JSON array of objects with '
                '"id" (uuid string), "text" (the objective), and "completed" (false). '
                'Example: [{"id":"...","text":"...","completed":false}]'
            ),
        ),
        HumanMessage(
            content=f'Generate learning objectives for chapter {chapter_index}: "{chapter_title}"',
        ),
    ]

    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='study-objectives',
    )

    objectives = _parse_list_result(result, ['id', 'text', 'completed'])
    if not objectives:
        objectives = _generic_objectives(chapter_title)

    return {
        'bookId': str(book_id) if book_id else None,
        'objectives': objectives,
    }


# ---------------------------------------------------------------------------
# Concept checks
# ---------------------------------------------------------------------------

async def generate_concept_checks(
    book_id: str | None,
    chapter_title: str,
    chapter_index: int | None,
    chapter_content: str,
) -> dict[str, Any]:
    """Generate concept check questions with answers and hints."""
    content_hint = ''
    if chapter_content:
        content_hint = f'\n\nChapter excerpt (first 2000 chars):\n{chapter_content[:2000]}'

    messages = [
        SystemMessage(
            content=(
                'You are a study assistant. Generate 3-5 concept check questions for '
                'the given chapter. Return ONLY a JSON array of objects, each with: '
                '"id" (uuid string), "question", "hint", "answer", and "position" '
                '(one of "start", "middle", "end"). '
                'Example: [{"id":"...","question":"...","hint":"...","answer":"...","position":"start"}]'
            ),
        ),
        HumanMessage(
            content=(
                f'Generate concept check questions for chapter {chapter_index}: '
                f'"{chapter_title}"{content_hint}'
            ),
        ),
    ]

    result = await safe_llm_invoke(
        messages,
        fallback=None,
        log_label='study-concept-checks',
    )

    checks = _parse_list_result(result, ['id', 'question', 'hint', 'answer', 'position'])
    if not checks:
        checks = _generic_checks(chapter_title)

    return {
        'bookId': str(book_id) if book_id else None,
        'checks': checks,
    }


async def save_checks_as_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: str,
    checks: list[dict[str, Any]],
) -> int:
    """Save concept check results as flashcards. Returns count saved."""
    if not book_id or not checks:
        return 0

    now = utcnow()

    # Verify book ownership
    book_result = await db.execute(
        select(Book.id).where(
            and_(Book.id == UUID(str(book_id)), Book.user_id == user_id),
        ),
    )
    if not book_result.scalar_one_or_none():
        return 0

    saved_count = 0
    for check in checks:
        question = check.get('question', '')
        answer = check.get('answer', '')
        if not question or not answer:
            continue

        card = Flashcard(
            id=uuid.uuid4(),
            user_id=user_id,
            book_id=UUID(str(book_id)),
            question=question,
            answer=answer,
            ease_factor=2.5,
            interval=0,
            repetition_count=0,
            next_review_at=now,
            last_review_at=None,
            last_rating=None,
            created_at=now,
            updated_at=now,
        )
        db.add(card)
        saved_count += 1

    await db.flush()
    return saved_count


# ---------------------------------------------------------------------------
# Mastery
# ---------------------------------------------------------------------------

async def get_mastery(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Return mastery data for a book based on progress and flashcard reviews."""
    # Fetch book
    book_result = await db.execute(
        select(Book).where(
            and_(Book.id == book_id, Book.user_id == user_id),
        ),
    )
    book = book_result.scalar_one_or_none()
    if not book:
        return {
            'bookId': str(book_id),
            'chaptersCompleted': 0,
            'totalChapters': 0,
            'overallMastery': 0.0,
            'weakAreas': [],
            'strongAreas': [],
            'cardsDue': 0,
        }

    # Book progress
    total_pages = max(book.total_pages or 1, 1)
    current_page = book.current_page or 0
    book_progress = min(current_page / total_pages, 1.0)

    # Estimate chapters (~25 pages per chapter)
    estimated_total_chapters = max(round(total_pages / 25), 1)
    chapters_completed = round(book_progress * estimated_total_chapters)

    # Flashcard stats
    total_cards = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(Flashcard.book_id == book_id, Flashcard.user_id == user_id),
        )
    ) or 0

    reviewed_cards = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.last_review_at.isnot(None),
            ),
        )
    ) or 0

    strong_cards = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.last_rating >= 3,
            ),
        )
    ) or 0

    now = utcnow()
    cards_due = await db.scalar(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.next_review_at <= now,
            ),
        )
    ) or 0

    # Calculate mastery
    flashcard_mastery = strong_cards / total_cards if total_cards > 0 else 0.0
    overall_mastery = round(0.4 * book_progress + 0.6 * flashcard_mastery, 2)

    # Weak/strong areas
    weak_areas: list[str] = []
    strong_areas: list[str] = []

    if total_cards > 0:
        mastery_ratio = strong_cards / total_cards
        if mastery_ratio < 0.3:
            weak_areas.append('Concept retention needs improvement')
        elif mastery_ratio < 0.6:
            weak_areas.append('Some concepts need review')
        else:
            strong_areas.append('Strong concept retention')

    if book_progress > 0.7:
        strong_areas.append('Good reading progress')
    elif book_progress > 0.3:
        weak_areas.append('Continue reading to build understanding')
    else:
        weak_areas.append('Early reading stage — focus on completing chapters')

    if cards_due > 0:
        weak_areas.append(f'{cards_due} flashcard(s) due for review')

    return {
        'bookId': str(book_id),
        'chaptersCompleted': chapters_completed,
        'totalChapters': estimated_total_chapters,
        'overallMastery': overall_mastery,
        'weakAreas': weak_areas[:5],
        'strongAreas': strong_areas[:5],
        'cardsDue': cards_due,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_list_result(
    result: Any,
    expected_keys: list[str],
) -> list[dict[str, Any]]:
    """Parse LLM result into a list of dicts with expected keys."""
    items: list[dict[str, Any]] = []

    if isinstance(result, list):
        for item in result[:5]:
            parsed = {}
            for key in expected_keys:
                parsed[key] = item.get(key) if isinstance(item, dict) else None
            if 'id' not in parsed or not parsed['id']:
                parsed['id'] = str(uuid.uuid4())
            items.append(parsed)
    elif isinstance(result, dict) and 'objectives' in result:
        for item in result['objectives'][:5]:
            parsed = {}
            for key in expected_keys:
                parsed[key] = item.get(key) if isinstance(item, dict) else None
            if 'id' not in parsed or not parsed['id']:
                parsed['id'] = str(uuid.uuid4())
            items.append(parsed)
    elif isinstance(result, dict) and 'checks' in result:
        for item in result['checks'][:5]:
            parsed = {}
            for key in expected_keys:
                parsed[key] = item.get(key) if isinstance(item, dict) else None
            if 'id' not in parsed or not parsed['id']:
                parsed['id'] = str(uuid.uuid4())
            items.append(parsed)

    return items
