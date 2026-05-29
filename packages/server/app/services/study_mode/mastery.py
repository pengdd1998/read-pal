"""Study mode mastery tracking and flashcard persistence."""

from __future__ import annotations

import structlog
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.flashcard import Flashcard
from app.utils import utcnow

logger = structlog.get_logger('read-pal.study_mode')


async def save_checks_as_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: str,
    checks: list[dict[str, Any]],
) -> int:
    """Save concept check results as flashcards. Returns count saved."""
    logger.info(
        'study_mode.save_flashcards.started',
        book_id=str(book_id),
        user_id=str(user_id),
        check_count=len(checks),
    )

    if not book_id or not checks:
        return 0

    now = utcnow()

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
    logger.info(
        'study_mode.save_flashcards.completed',
        book_id=str(book_id),
        flashcards_saved=saved_count,
    )
    return saved_count


async def get_mastery(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Return mastery data for a book based on progress and flashcard reviews."""
    logger.info(
        'study_mode.get_mastery.started',
        book_id=str(book_id),
        user_id=str(user_id),
    )

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

    total_pages = max(book.total_pages or 1, 1)
    current_page = book.current_page or 0
    book_progress = min(current_page / total_pages, 1.0)

    estimated_total_chapters = max(round(total_pages / 25), 1)
    chapters_completed = round(book_progress * estimated_total_chapters)

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

    flashcard_mastery = strong_cards / total_cards if total_cards > 0 else 0.0
    overall_mastery = round(0.4 * book_progress + 0.6 * flashcard_mastery, 2)

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

    logger.info(
        'study_mode.get_mastery.completed',
        book_id=str(book_id),
        mastery_level=overall_mastery,
        cards_due=cards_due,
        total_cards=total_cards,
    )

    return {
        'bookId': str(book_id),
        'chaptersCompleted': chapters_completed,
        'totalChapters': estimated_total_chapters,
        'overallMastery': overall_mastery,
        'weakAreas': weak_areas[:5],
        'strongAreas': strong_areas[:5],
        'cardsDue': cards_due,
    }
