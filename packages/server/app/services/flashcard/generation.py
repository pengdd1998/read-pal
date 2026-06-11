"""LLM-based flashcard generation from book annotations."""

import json
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.flashcard import Flashcard
from app.prompts import FLASHCARD_GENERATION_HUMAN, FLASHCARD_GENERATION_SYSTEM
from app.services.llm import safe_llm_call
from app.utils import utcnow
from app.utils.db import db_error_guard

from .sm2 import DEFAULT_EASE_FACTOR

logger = structlog.get_logger('read-pal.flashcards')


async def _fetch_book_and_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> tuple[Book, list[Annotation]]:
    """Fetch book and its annotations for flashcard generation."""
    async with db_error_guard(
        'generation._fetch_book_and_annotations',
    ):
        book_result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = book_result.scalar_one_or_none()
        if not book:
            raise ValueError(f'Book {book_id} not found for user {user_id}')

        ann_result = await db.execute(
            select(Annotation)
            .where(
                Annotation.book_id == book_id,
                Annotation.user_id == user_id,
                Annotation.type.in_(['highlight', 'note']),
            )
            .order_by(Annotation.created_at.desc())
            .limit(20),
        )
        annotations = list(ann_result.scalars().all())
        if not annotations:
            raise ValueError('No highlights or notes found for this book')

        return book, annotations


def _format_annotation_text(annotations: list[Annotation]) -> str:
    """Build the annotation text block for the LLM prompt."""
    return '\n'.join(
        f'- [{a.type}] {a.content[:200]}'
        + (f' (note: {a.note[:100]})' if a.note else '')
        for a in annotations[:15]
    )


async def _call_flashcard_llm(
    book: Book,
    annotation_text: str,
    count: int,
    user_id: UUID,
    book_id: UUID,
) -> str:
    """Call the LLM to generate flashcard JSON."""
    system_prompt = FLASHCARD_GENERATION_SYSTEM.template.format(count=count)
    human_prompt = FLASHCARD_GENERATION_HUMAN.template.format(
        title=book.title,
        author=book.author or 'Unknown',
        annotation_text=annotation_text,
    )
    return await safe_llm_call(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback='[]',
        log_label='Flashcard generation',
        user_id=str(user_id),
        book_id=str(book_id),
    )


def _parse_and_create_cards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    llm_result: str,
    count: int,
) -> list[Flashcard]:
    """Parse LLM JSON output and create Flashcard ORM objects."""
    cards: list[Flashcard] = []
    try:
        parsed = json.loads(llm_result or '[]')
        if not isinstance(parsed, list):
            return cards
        for item in parsed[:count]:
            q = item.get('question', '').strip()
            a = item.get('answer', '').strip()
            if not q or not a:
                continue
            card = Flashcard(
                user_id=user_id,
                book_id=book_id,
                question=q[:2000],
                answer=a[:5000],
                ease_factor=DEFAULT_EASE_FACTOR,
                interval=0,
                repetition_count=0,
                next_review_at=utcnow(),
            )
            db.add(card)
            cards.append(card)
    except (json.JSONDecodeError, AttributeError) as exc:
        logger.warning('flashcard.parse_failed', error=str(exc)[:200])
    return cards


async def generate_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    count: int = 5,
) -> list[Flashcard]:
    """Generate flashcards from a book's annotations via LLM."""
    count = max(1, min(count, 10))

    # Skip if cards already exist for this book (dedup guard)
    async with db_error_guard(
        'generation.generate_flashcards.dedup',
    ):
        existing = await db.execute(
            select(Flashcard).where(
                Flashcard.user_id == user_id,
                Flashcard.book_id == book_id,
            ).limit(1),
        )
        if existing.scalar_one_or_none():
            logger.info('flashcard.generate.skipped_existing', book_id=str(book_id))
            return []

    book, annotations = await _fetch_book_and_annotations(db, user_id, book_id)
    annotation_text = _format_annotation_text(annotations)

    llm_result = await _call_flashcard_llm(
        book, annotation_text, count, user_id, book_id,
    )

    cards = _parse_and_create_cards(db, user_id, book_id, llm_result, count)
    if cards:
        async with db_error_guard(
            'generation.generate_flashcards.flush',
        ):
            await db.flush()

    logger.info(
        'flashcard.generate.completed',
        book_id=str(book_id),
        generated=len(cards),
    )
    return cards
