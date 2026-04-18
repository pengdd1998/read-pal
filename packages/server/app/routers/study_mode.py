"""Study mode routes — objectives, concept checks, mastery tracking."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.book import Book
from app.models.flashcard import Flashcard
from app.services.llm import safe_llm_invoke

logger = logging.getLogger('read-pal.study')

router = APIRouter(prefix='/api/v1/study-mode', tags=['study-mode'])


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
# POST /objectives
# ---------------------------------------------------------------------------

@router.post('/objectives')
async def generate_objectives(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate study objectives for a chapter using LLM."""
    book_id = body.get('bookId') or body.get('book_id')
    chapter_title = body.get('chapterTitle') or body.get('chapter_title') or 'this chapter'
    chapter_index = body.get('chapterIndex') if body.get('chapterIndex') is not None else body.get('chapter_index')

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

    objectives: list[dict[str, Any]] = []
    if isinstance(result, list):
        for item in result[:5]:
            objectives.append({
                'id': item.get('id') or str(uuid.uuid4()),
                'text': str(item.get('text', '')),
                'completed': bool(item.get('completed', False)),
            })
    elif isinstance(result, dict) and 'objectives' in result:
        for item in result['objectives'][:5]:
            objectives.append({
                'id': item.get('id') or str(uuid.uuid4()),
                'text': str(item.get('text', '')),
                'completed': bool(item.get('completed', False)),
            })

    if not objectives:
        objectives = _generic_objectives(chapter_title)

    return {
        'success': True,
        'data': {
            'bookId': str(book_id) if book_id else None,
            'objectives': objectives,
        },
    }


# ---------------------------------------------------------------------------
# POST /concept-checks
# ---------------------------------------------------------------------------

@router.post('/concept-checks')
async def generate_concept_checks(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate concept check questions with answers and hints."""
    book_id = body.get('bookId') or body.get('book_id')
    chapter_title = body.get('chapterTitle') or body.get('chapter_title') or 'this chapter'
    chapter_index = body.get('chapterIndex') if body.get('chapterIndex') is not None else body.get('chapter_index')
    chapter_content = body.get('chapterContent') or body.get('chapter_content') or ''

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

    checks: list[dict[str, Any]] = []
    if isinstance(result, list):
        for item in result[:5]:
            checks.append({
                'id': item.get('id') or str(uuid.uuid4()),
                'question': str(item.get('question', '')),
                'hint': str(item.get('hint', '')),
                'answer': str(item.get('answer', '')),
                'position': item.get('position', 'middle'),
            })
    elif isinstance(result, dict) and 'checks' in result:
        for item in result['checks'][:5]:
            checks.append({
                'id': item.get('id') or str(uuid.uuid4()),
                'question': str(item.get('question', '')),
                'hint': str(item.get('hint', '')),
                'answer': str(item.get('answer', '')),
                'position': item.get('position', 'middle'),
            })

    if not checks:
        checks = _generic_checks(chapter_title)

    return {
        'success': True,
        'data': {
            'bookId': str(book_id) if book_id else None,
            'checks': checks,
        },
    }


# ---------------------------------------------------------------------------
# POST /save-checks
# ---------------------------------------------------------------------------

@router.post('/save-checks')
async def save_concept_checks(
    body: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Save concept check results as flashcards for spaced repetition."""
    book_id = body.get('bookId') or body.get('book_id')
    checks = body.get('checks', [])

    if not book_id or not checks:
        return {'success': True, 'data': {'message': 'Results saved'}}

    user_id = UUID(current_user['id'])
    now = datetime.now(timezone.utc)

    # Verify book ownership
    book_result = await db.execute(
        select(Book.id).where(
            and_(Book.id == UUID(str(book_id)), Book.user_id == user_id),
        ),
    )
    if not book_result.scalar_one_or_none():
        return {'success': True, 'data': {'message': 'Results saved'}}

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
    logger.info('Saved %d concept checks for book %s', saved_count, book_id)

    return {'success': True, 'data': {'message': 'Results saved'}}


# ---------------------------------------------------------------------------
# GET /mastery/{bookId}
# ---------------------------------------------------------------------------

@router.get('/mastery/{book_id}')
async def get_mastery(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return mastery data for a book based on progress and flashcard reviews."""
    user_id = UUID(current_user['id'])

    # Fetch book
    book_result = await db.execute(
        select(Book).where(
            and_(Book.id == book_id, Book.user_id == user_id),
        ),
    )
    book = book_result.scalar_one_or_none()
    if not book:
        return {
            'success': True,
            'data': {
                'bookId': str(book_id),
                'chaptersCompleted': 0,
                'totalChapters': 0,
                'overallMastery': 0.0,
                'weakAreas': [],
                'strongAreas': [],
                'cardsDue': 0,
            },
        }

    # Book progress
    total_pages = max(book.total_pages or 1, 1)
    current_page = book.current_page or 0
    book_progress = min(current_page / total_pages, 1.0)

    # Estimate chapters (~25 pages per chapter)
    estimated_total_chapters = max(round(total_pages / 25), 1)
    chapters_completed = round(book_progress * estimated_total_chapters)

    # Flashcard stats
    card_count_result = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(Flashcard.book_id == book_id, Flashcard.user_id == user_id),
        ),
    )
    total_cards = card_count_result.scalar() or 0

    reviewed_result = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.last_review_at.isnot(None),
            ),
        ),
    )
    reviewed_cards = reviewed_result.scalar() or 0

    strong_result = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.last_rating >= 3,
            ),
        ),
    )
    strong_cards = strong_result.scalar() or 0

    now = datetime.now(timezone.utc)
    due_result = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
                Flashcard.next_review_at <= now,
            ),
        ),
    )
    cards_due = due_result.scalar() or 0

    # Calculate mastery
    if total_cards > 0:
        flashcard_mastery = strong_cards / total_cards
    else:
        flashcard_mastery = 0.0

    # Weighted: 40% book progress + 60% flashcard mastery
    overall_mastery = round(0.4 * book_progress + 0.6 * flashcard_mastery, 2)

    # Weak/strong areas — based on flashcard performance
    weak_areas: list[str] = []
    strong_areas: list[str] = []

    if total_cards > 0:
        mastery_ratio = strong_cards / total_cards if total_cards > 0 else 0
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
        'success': True,
        'data': {
            'bookId': str(book_id),
            'chaptersCompleted': chapters_completed,
            'totalChapters': estimated_total_chapters,
            'overallMastery': overall_mastery,
            'weakAreas': weak_areas[:5],
            'strongAreas': strong_areas[:5],
            'cardsDue': cards_due,
        },
    }
