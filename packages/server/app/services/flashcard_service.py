"""Flashcard business logic — SM-2 spaced repetition algorithm."""

import logging
from datetime import timedelta
from uuid import UUID

from app.utils import utcnow

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.models.flashcard import Flashcard
from app.schemas.flashcard import FlashcardCreate

logger = logging.getLogger('read-pal.flashcards')

DEFAULT_EASE_FACTOR = 2.5
MIN_EASE_FACTOR = 1.3


async def create_flashcard(
    db: AsyncSession,
    user_id: UUID,
    data: FlashcardCreate,
) -> Flashcard:
    """Create a flashcard with SM-2 defaults."""
    card = Flashcard(
        user_id=user_id,
        book_id=data.book_id,
        annotation_id=data.annotation_id,
        question=data.question,
        answer=data.answer,
        ease_factor=DEFAULT_EASE_FACTOR,
        interval=0,
        repetition_count=0,
        next_review_at=utcnow(),
    )
    db.add(card)
    await db.flush()
    await db.refresh(card)
    logger.info('Flashcard created: id=%s user=%s book=%s', card.id, user_id, data.book_id)
    return card


async def review_flashcard(
    db: AsyncSession,
    user_id: UUID,
    flashcard_id: UUID,
    rating: int,
) -> Flashcard:
    """Apply SM-2 algorithm to update flashcard scheduling."""
    result = await db.execute(
        select(Flashcard).where(
            Flashcard.id == flashcard_id,
            Flashcard.user_id == user_id,
        ),
    )
    card = result.scalar_one_or_none()
    if card is None:
        raise ValueError('Flashcard not found')

    old_ef = card.ease_factor

    if rating < 3:
        # Failed — reset
        new_interval = 1
        new_repetition = 0
    else:
        # Passed
        new_repetition = card.repetition_count + 1
        if card.repetition_count == 0:
            new_interval = 1
        elif card.repetition_count == 1:
            new_interval = 6
        else:
            new_interval = round(card.interval * old_ef)

    # Update ease factor
    new_ef = max(
        MIN_EASE_FACTOR,
        old_ef + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02)),
    )

    now = utcnow()
    card.ease_factor = new_ef
    card.interval = new_interval
    card.repetition_count = new_repetition
    card.next_review_at = now + timedelta(days=new_interval)
    card.last_review_at = now
    card.last_rating = rating

    await db.flush()
    await db.refresh(card)
    logger.info('Flashcard reviewed: id=%s user=%s rating=%d interval=%d ef=%.2f', flashcard_id, user_id, rating, new_interval, new_ef)
    return card


async def get_due_cards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
    limit: int = 200,
) -> list[Flashcard]:
    """Get flashcards due for review (capped at `limit`)."""
    now = utcnow()
    query = (
        select(Flashcard)
        .where(
            Flashcard.user_id == user_id,
            Flashcard.next_review_at <= now,
        )
        .order_by(Flashcard.next_review_at.asc())
        .limit(limit)
    )
    if book_id is not None:
        query = query.where(Flashcard.book_id == book_id)

    result = await db.execute(query)
    return list(result.scalars().all())


async def list_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Flashcard], int]:
    """List flashcards with pagination."""
    base_filter = [Flashcard.user_id == user_id]
    if book_id is not None:
        base_filter.append(Flashcard.book_id == book_id)

    count_result = await db.execute(
        select(func.count())
        .select_from(Flashcard)
        .where(*base_filter),
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Flashcard)
        .where(*base_filter)
        .order_by(Flashcard.created_at.desc())
        .offset(offset)
        .limit(per_page),
    )
    return list(result.scalars().all()), total


async def list_decks(db: AsyncSession, user_id: UUID) -> dict:
    """List flashcard decks grouped by book."""
    result = await db.execute(
        select(
            Flashcard.book_id,
            Book.title.label('book_title'),
            Book.author,
            Book.cover_url,
            func.count(Flashcard.id).label('card_count'),
        )
        .join(Book, Book.id == Flashcard.book_id)
        .where(Flashcard.user_id == user_id)
        .group_by(Flashcard.book_id, Book.title, Book.author, Book.cover_url),
    )
    decks = [
        {
            'bookId': str(row.book_id),
            'bookTitle': row.book_title or '',
            'author': row.author or '',
            'coverUrl': row.cover_url,
            'total': row.card_count,
            'due': row.card_count,
        }
        for row in result.all()
    ]
    return {
        'decks': decks,
        'totalCards': sum(d['total'] for d in decks),
        'totalDue': sum(d['due'] for d in decks),
    }
