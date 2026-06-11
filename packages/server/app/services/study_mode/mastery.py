"""Study mode mastery tracking and flashcard persistence."""

from __future__ import annotations

import asyncio
import structlog
import uuid
from collections import defaultdict
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.document import Document
from app.models.flashcard import Flashcard
from app.utils import utcnow

logger = structlog.get_logger('read-pal.study_mode')


def _build_flashcard(
    user_id: UUID,
    book_id: UUID,
    question: str,
    answer: str,
    now: datetime,
) -> Flashcard:
    """Build a single Flashcard ORM object with SM-2 defaults."""
    return Flashcard(
        id=uuid.uuid4(),
        user_id=user_id,
        book_id=book_id,
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

    try:
        book_result = await db.execute(
            select(Book.id).where(
                and_(Book.id == UUID(str(book_id)), Book.user_id == user_id),
            ),
        )
        if not book_result.scalar_one_or_none():
            return 0

        now = utcnow()
        parsed_book_id = UUID(str(book_id))
        saved_count = 0
        for check in checks:
            question = check.get('question', '')
            answer = check.get('answer', '')
            if not question or not answer:
                continue
            db.add(_build_flashcard(user_id, parsed_book_id, question, answer, now))
            saved_count += 1

        await db.flush()
    except DBAPIError as exc:
        logger.error('mastery.save_checks_as_flashcards DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    logger.info(
        'study_mode.save_flashcards.completed',
        book_id=str(book_id),
        flashcards_saved=saved_count,
    )
    return saved_count


def _extract_chapter_name(location: dict | None, fallback_index: int) -> str:
    """Extract a readable chapter/topic name from an annotation location."""
    if not location:
        return f'Topic {fallback_index}'
    # Location JSONB may contain 'chapter', 'chapterTitle', 'section', etc.
    for key in ('chapterTitle', 'chapter', 'section', 'title'):
        val = location.get(key)
        if val and isinstance(val, str) and val.strip():
            return val.strip()[:80]
    # Fallback: chapter index from location
    ch_idx = location.get('chapterIndex') or location.get('chapter_index')
    if ch_idx is not None:
        return f'Chapter {ch_idx}'
    return f'Topic {fallback_index}'


def _extract_question_topic(question: str) -> str:
    """Derive a short topic label from the first few words of a question."""
    words = question.strip().split()
    # Take first 4 meaningful words as a topic hint
    topic = ' '.join(words[:4])
    return topic[:60] if len(topic) > 60 else topic


def _resolve_chapter_names(doc_chapters_raw: list[Any]) -> dict[int, str]:
    """Extract chapter names from the raw document chapters list."""
    chapter_names: dict[int, str] = {}
    for idx, ch in enumerate(doc_chapters_raw, start=1):
        if isinstance(ch, dict):
            name = ch.get('title') or ch.get('label') or ''
        elif isinstance(ch, str):
            name = ch
        else:
            name = ''
        if name:
            chapter_names[idx] = name[:80]
    return chapter_names


def _compute_topic_stats(
    flashcard_rows: list[Any],
) -> dict[str, dict[str, float]]:
    """Group flashcard rows by topic and compute per-topic stats."""
    topic_stats: dict[str, dict[str, float]] = defaultdict(
        lambda: {'count': 0.0, 'strong': 0.0, 'total_ef': 0.0, 'rated': 0.0},
    )
    fallback_idx = 1
    for row in flashcard_rows:
        loc = row.location
        if loc and isinstance(loc, dict):
            topic = _extract_chapter_name(loc, fallback_idx)
        else:
            topic = _extract_question_topic(row.question or 'Unknown')
        fallback_idx += 1

        stats = topic_stats[topic]
        stats['count'] += 1
        stats['total_ef'] += row.ease_factor or 2.5
        if (row.last_rating or 0) >= 3:
            stats['strong'] += 1
        if row.last_review_at is not None:
            stats['rated'] += 1
    return topic_stats


def _compute_topic_mastery(
    topic_stats: dict[str, dict[str, float]],
    chapter_names: dict[int, str],
    book_progress: float,
    cards_due: int,
) -> tuple[list[str], list[str]]:
    """Derive strong and weak area labels from per-topic mastery scores."""
    if not topic_stats and chapter_names:
        for name in chapter_names.values():
            topic_stats[name] = {
                'count': 0.0, 'strong': 0.0, 'total_ef': 0.0, 'rated': 0.0,
            }

    topic_mastery: list[tuple[str, float]] = []
    for topic, stats in topic_stats.items():
        if stats['count'] == 0:
            topic_mastery.append((topic, 0.0))
        else:
            ratio = stats['strong'] / stats['count']
            avg_ef = stats['total_ef'] / stats['count']
            ef_bonus = max(0.0, (avg_ef - 2.0) / 3.0)
            score = min(1.0, ratio * 0.7 + ef_bonus * 0.3)
            topic_mastery.append((topic, score))

    topic_mastery.sort(key=lambda x: x[1], reverse=True)
    strong_areas = [t for t, s in topic_mastery if s >= 0.5][:3]
    weak_areas = [t for t, s in reversed(topic_mastery) if s < 0.5][:3]

    if cards_due > 0:
        weak_areas.append(f'{cards_due} flashcard(s) due for review')
    if not strong_areas and book_progress > 0.7:
        strong_areas.append('Good reading progress')
    if not weak_areas and book_progress < 0.3:
        weak_areas.append('Early reading stage — focus on completing chapters')

    return strong_areas[:5], weak_areas[:5]


async def _fetch_flashcard_rows(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[Any]:
    """Fetch flashcard rows with annotation location for mastery computation."""
    fc_query = (
        select(
            Flashcard.id,
            Flashcard.question,
            Flashcard.ease_factor,
            Flashcard.repetition_count,
            Flashcard.last_rating,
            Flashcard.last_review_at,
            Flashcard.annotation_id,
            Annotation.location,
        )
        .outerjoin(Annotation, Annotation.id == Flashcard.annotation_id)
        .where(
            and_(
                Flashcard.book_id == book_id,
                Flashcard.user_id == user_id,
            ),
        )
    )
    try:
        fc_result = await db.execute(fc_query)
        return fc_result.all()
    except DBAPIError as exc:
        logger.error('mastery._fetch_flashcard_rows DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc


async def _count_cards_due(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> int:
    """Count flashcards due for review."""
    now = utcnow()
    try:
        return await db.scalar(
            select(func.count(Flashcard.id)).where(
                and_(
                    Flashcard.book_id == book_id,
                    Flashcard.user_id == user_id,
                    Flashcard.next_review_at <= now,
                ),
            )
        ) or 0
    except DBAPIError as exc:
        logger.error('mastery._count_cards_due DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc


def _compute_overall_mastery(
    book_progress: float,
    flashcard_rows: list[Any],
) -> float:
    """Compute weighted overall mastery from book progress and flashcard performance."""
    total_cards = len(flashcard_rows)
    strong_cards = sum(1 for r in flashcard_rows if (r.last_rating or 0) >= 3)
    flashcard_mastery = strong_cards / total_cards if total_cards > 0 else 0.0
    return round(0.4 * book_progress + 0.6 * flashcard_mastery, 2)


async def get_mastery(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Return mastery data for a book based on progress and flashcard reviews."""
    logger.info('study_mode.get_mastery.started', book_id=str(book_id), user_id=str(user_id))

    try:
        book_result = await db.execute(
            select(Book).where(and_(Book.id == book_id, Book.user_id == user_id)),
        )
        book = book_result.scalar_one_or_none()
    except DBAPIError as exc:
        logger.error('mastery.get_mastery DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    if not book:
        return {'bookId': str(book_id), 'chaptersCompleted': 0, 'totalChapters': 0,
                'overallMastery': 0.0, 'weakAreas': [], 'strongAreas': [], 'cardsDue': 0}

    total_pages = max(book.total_pages or 1, 1)
    book_progress = min((book.current_page or 0) / total_pages, 1.0)

    try:
        doc_result = await db.execute(
            select(Document.chapters).where(and_(Document.book_id == book_id, Document.user_id == user_id)),
        )
        chapter_names = _resolve_chapter_names(doc_result.scalar_one_or_none() or [])
    except DBAPIError as exc:
        logger.error('mastery.get_mastery.doc DB error: %s', exc, exc_info=True)
        raise RuntimeError('Database error') from exc
    estimated_total = max(len(chapter_names) if chapter_names else round(total_pages / 25), 1)

    flashcard_rows, cards_due = await asyncio.gather(
        _fetch_flashcard_rows(db, user_id, book_id),
        _count_cards_due(db, user_id, book_id),
    )
    overall_mastery = _compute_overall_mastery(book_progress, flashcard_rows)

    topic_stats = _compute_topic_stats(flashcard_rows)
    strong_areas, weak_areas = _compute_topic_mastery(topic_stats, chapter_names, book_progress, cards_due)

    logger.info('study_mode.get_mastery.completed', book_id=str(book_id), mastery_level=overall_mastery,
                cards_due=cards_due, total_cards=len(flashcard_rows), topic_count=len(topic_stats))

    return {'bookId': str(book_id), 'chaptersCompleted': round(book_progress * estimated_total),
            'totalChapters': estimated_total, 'overallMastery': overall_mastery,
            'weakAreas': weak_areas, 'strongAreas': strong_areas, 'cardsDue': cards_due}
