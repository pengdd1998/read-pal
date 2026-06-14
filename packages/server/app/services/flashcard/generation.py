"""LLM-based flashcard generation from book annotations."""

import hashlib
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.flashcard import Flashcard
from app.prompts import FLASHCARD_GENERATION_HUMAN, FLASHCARD_GENERATION_SYSTEM
from app.schemas.llm_outputs import FlashcardList
from app.services.llm import safe_llm_invoke
from app.utils import utcnow
from app.utils.db import db_error_guard
from app.utils.i18n import t

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
            raise ValueError(t('errors.book_not_found_user', book_id=str(book_id), user_id=str(user_id)))

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
) -> dict[str, Any]:
    """Call the LLM to generate flashcards, validated against FlashcardList.

    Uses safe_llm_invoke (fence-stripping, JSON parsing, schema validation,
    caching, circuit breaker) instead of raw safe_llm_call + bare json.loads,
    which silently returned [] whenever GLM wrapped output in prose/fences.
    """
    system_prompt = FLASHCARD_GENERATION_SYSTEM.template.format(count=count)
    human_prompt = FLASHCARD_GENERATION_HUMAN.template.format(
        title=book.title,
        author=book.author or 'Unknown',
        annotation_text=annotation_text,
    )
    return await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=FlashcardList().model_dump(),
        log_label='Flashcard generation',
        schema_class=FlashcardList,
        user_id=str(user_id),
        book_id=str(book_id),
    )


def _create_cards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    result: dict[str, Any],
    count: int,
) -> list[Flashcard]:
    """Create Flashcard ORM objects from the validated structured output."""
    cards: list[Flashcard] = []
    items = result.get('cards', []) if isinstance(result, dict) else []
    for item in items[:count]:
        q = str(item.get('question', '')).strip()
        a = str(item.get('answer', '')).strip()
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
    return cards


def _advisory_lock_key(user_id: UUID, book_id: UUID) -> int:
    """Stable int64 lock key for (user_id, book_id) pair.

    Uses first 8 bytes of SHA-256, masked to 63 bits so the result fits
    in PostgreSQL's signed int8 (pg_advisory_xact_lock requires bigint).
    """
    digest = hashlib.sha256(f'{user_id}:{book_id}'.encode()).digest()
    return int.from_bytes(digest[:8], 'big', signed=False) & ((1 << 63) - 1)


async def generate_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    count: int = 5,
) -> list[Flashcard]:
    """Generate flashcards from a book's annotations via LLM."""
    count = max(1, min(count, 10))

    # Acquire a transaction-scoped advisory lock so two concurrent
    # generate requests for the same (user, book) serialize across
    # workers. Without this, both pass the dedup check below, both
    # call the LLM (~2x cost), and both insert duplicate cards.
    # pg_advisory_xact_lock auto-releases at COMMIT/ROLLBACK.
    lock_key = _advisory_lock_key(user_id, book_id)
    async with db_error_guard('generation.generate_flashcards.advisory_lock'):
        await db.execute(
            text('SELECT pg_advisory_xact_lock(:k)'), {'k': lock_key},
        )

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

    cards = _create_cards(db, user_id, book_id, llm_result, count)
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
