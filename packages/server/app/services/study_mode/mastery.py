"""Study mode mastery tracking and flashcard persistence."""

from __future__ import annotations

import structlog
import uuid
from collections import defaultdict
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.document import Document
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


async def get_mastery(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Return mastery data for a book based on progress and flashcard reviews.

    Strong/weak areas are derived from per-topic flashcard performance
    instead of generic static strings.
    """
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

    # Resolve chapter list from the book's parsed document
    doc_result = await db.execute(
        select(Document.chapters).where(
            and_(Document.book_id == book_id, Document.user_id == user_id),
        ),
    )
    doc_chapters_raw = doc_result.scalar_one_or_none() or []
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

    estimated_total_chapters = max(
        len(chapter_names) if chapter_names else round(total_pages / 25),
        1,
    )
    chapters_completed = round(book_progress * estimated_total_chapters)

    # ------------------------------------------------------------------
    # Fetch all flashcards for this book+user (with annotation join)
    # ------------------------------------------------------------------
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
    fc_result = await db.execute(fc_query)
    flashcard_rows = fc_result.all()

    total_cards = len(flashcard_rows)
    strong_cards = sum(1 for r in flashcard_rows if (r.last_rating or 0) >= 3)

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

    # ------------------------------------------------------------------
    # Group flashcards by topic to derive real strong/weak areas
    # ------------------------------------------------------------------
    topic_stats: dict[str, dict[str, float]] = defaultdict(
        lambda: {'count': 0.0, 'strong': 0.0, 'total_ef': 0.0, 'rated': 0.0},
    )

    fallback_idx = 1
    for row in flashcard_rows:
        # Try annotation location first for topic name
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

    # If no flashcards, fall back to book's chapters as topic areas
    if not topic_stats and chapter_names:
        for _idx, name in chapter_names.items():
            topic_stats[name] = {'count': 0.0, 'strong': 0.0, 'total_ef': 0.0, 'rated': 0.0}

    # Compute a mastery score per topic
    topic_mastery: list[tuple[str, float]] = []
    for topic, stats in topic_stats.items():
        if stats['count'] == 0:
            topic_mastery.append((topic, 0.0))
        else:
            ratio = stats['strong'] / stats['count']
            avg_ef = stats['total_ef'] / stats['count']
            # Higher ease_factor = better retention; normalize around 2.5
            ef_bonus = max(0.0, (avg_ef - 2.0) / 3.0)
            score = min(1.0, ratio * 0.7 + ef_bonus * 0.3)
            topic_mastery.append((topic, score))

    # Sort: highest mastery first
    topic_mastery.sort(key=lambda x: x[1], reverse=True)

    strong_areas: list[str] = [t for t, s in topic_mastery if s >= 0.5][:3]
    weak_areas: list[str] = [t for t, s in reversed(topic_mastery) if s < 0.5][:3]

    # Append supplementary status messages
    if cards_due > 0:
        weak_areas.append(f'{cards_due} flashcard(s) due for review')
    if not strong_areas and book_progress > 0.7:
        strong_areas.append('Good reading progress')
    if not weak_areas and book_progress < 0.3:
        weak_areas.append('Early reading stage — focus on completing chapters')

    logger.info(
        'study_mode.get_mastery.completed',
        book_id=str(book_id),
        mastery_level=overall_mastery,
        cards_due=cards_due,
        total_cards=total_cards,
        topic_count=len(topic_mastery),
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
