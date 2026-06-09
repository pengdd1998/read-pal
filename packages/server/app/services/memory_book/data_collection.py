"""Data collection for Reading Mirror — raw book data and enrichment."""

from __future__ import annotations

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession
from app.services.memory_book.enrichment import (
    enrich_reading_metrics,
    enrich_with_knowledge_graph,
    enrich_with_synthesis_themes,
    fetch_other_books,
)
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_user_input

logger = structlog.get_logger('read-pal.memory_book')


# ---------------------------------------------------------------------------
# Per-source data fetchers
# ---------------------------------------------------------------------------


async def _fetch_book_meta(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Fetch book metadata or return None if not found."""
    try:
        result = await db.execute(
            select(Book).where(Book.id == book_id, Book.user_id == user_id),
        )
        book = result.scalar_one_or_none()
        if book is None:
            return None
        return {
            'id': str(book.id), 'title': book.title, 'author': book.author,
            'cover_url': book.cover_url, 'progress': float(book.progress),
            'status': book.status,
            'started_at': book.started_at.isoformat() if book.started_at else None,
            'completed_at': book.completed_at.isoformat() if book.completed_at else None,
        }
    except Exception:
        logger.error('Failed to fetch book meta for book %s', book_id, exc_info=True)
        return None


async def _fetch_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> tuple[list[dict], list[dict]]:
    """Fetch highlights and notes from annotations.

    Returns (highlights, notes).
    """
    try:
        result = await db.execute(
            select(Annotation)
            .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
            .order_by(Annotation.created_at)
            .limit(500),
        )
        annotations = list(result.scalars().all())

        highlights = [
            {
                'id': str(a.id),
                'content': sanitize_user_input(a.content, context='highlight_content'),
                'note': sanitize_user_input(a.note or '', context='highlight_note'),
                'tags': a.tags, 'location': a.location,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in annotations
            if match_annotation_type(a.type, AnnotationType.highlight)
        ]
        notes = [
            {
                'id': str(a.id),
                'content': sanitize_user_input(a.content, context='note_content'),
                'note': sanitize_user_input(a.note or '', context='note_text'),
                'tags': a.tags,
                'created_at': a.created_at.isoformat() if a.created_at else None,
            }
            for a in annotations
            if match_annotation_type(a.type, AnnotationType.note)
        ]
        return highlights, notes
    except Exception:
        logger.error('Failed to fetch annotations for book %s', book_id, exc_info=True)
        return [], []


async def _fetch_conversations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Fetch chat messages for the book."""
    try:
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.user_id == user_id, ChatMessage.book_id == book_id)
            .order_by(ChatMessage.created_at)
            .limit(200),
        )
        messages = list(result.scalars().all())
        return [
            {
                'role': m.role,
                'content': sanitize_user_input(m.content, context='chat_message'),
            }
            for m in messages
        ]
    except Exception:
        logger.error('Failed to fetch conversations for book %s', book_id, exc_info=True)
        return []


async def _fetch_reading_sessions(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> tuple[list[dict], list]:
    """Fetch reading sessions.

    Returns (serialized_sessions, raw_session_objects).
    """
    try:
        result = await db.execute(
            select(ReadingSession)
            .where(ReadingSession.user_id == user_id, ReadingSession.book_id == book_id)
            .order_by(ReadingSession.started_at)
            .limit(100),
        )
        sessions = list(result.scalars().all())
        serialized = [
            {
                'started_at': s.started_at.isoformat() if s.started_at else None,
                'duration': s.duration,
                'pages_read': s.pages_read,
                'highlights': s.highlights,
                'notes': s.notes,
            }
            for s in sessions
        ]
        return serialized, sessions
    except Exception:
        logger.error('Failed to fetch reading sessions for book %s', book_id, exc_info=True)
        return [], []


async def _fetch_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Fetch flashcards for the 'What Stuck' section."""
    try:
        result = await db.execute(
            select(Flashcard)
            .where(Flashcard.user_id == user_id, Flashcard.book_id == book_id)
            .order_by(Flashcard.created_at.desc())
            .limit(30),
        )
        flashcards = list(result.scalars().all())
        return [
            {
                'question': fc.question,
                'answer': fc.answer[:200],
                'last_rating': fc.last_rating,
                'repetition_count': fc.repetition_count,
                'ease_factor': round(float(fc.ease_factor), 2),
            }
            for fc in flashcards
        ]
    except Exception:
        logger.error('Failed to fetch flashcards for book %s', book_id, exc_info=True)
        return []


def _build_stats(
    highlights: list,
    notes: list,
    conversations: list,
    sessions: list,
) -> dict[str, int]:
    """Compute aggregate stats from collected data."""
    return {
        'total_highlights': len(highlights),
        'total_notes': len(notes),
        'total_conversations': len(conversations),
        'total_sessions': len(sessions),
        'total_reading_minutes': sum(s.duration for s in sessions) // 60,
        'total_pages_read': sum(s.pages_read for s in sessions),
    }


# ---------------------------------------------------------------------------
# Core orchestrators
# ---------------------------------------------------------------------------


async def _collect_book_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw reading data from all sources."""
    book_meta = await _fetch_book_meta(db, user_id, book_id)
    if book_meta is None:
        return {}

    highlights, notes = await _fetch_annotations(db, user_id, book_id)
    conversations = await _fetch_conversations(db, user_id, book_id)
    reading_sessions, raw_sessions = await _fetch_reading_sessions(
        db, user_id, book_id,
    )
    flashcards = await _fetch_flashcards(db, user_id, book_id)
    stats = _build_stats(highlights, notes, conversations, raw_sessions)
    stats['total_flashcards'] = len(flashcards)

    return {
        'book': book_meta,
        'highlights': highlights,
        'notes': notes,
        'conversations': conversations,
        'reading_sessions': reading_sessions,
        'flashcards': flashcards,
        'stats': stats,
    }


async def _collect_enriched_data(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Collect raw data + enrich with knowledge graph, mastery, and synthesis."""
    data = await _collect_book_data(db, user_id, book_id)
    if not data.get('book'):
        return data

    enriched: dict[str, Any] = {**data}

    # Knowledge graph concepts + edges for concept_web section
    kg = await enrich_with_knowledge_graph(db, user_id, book_id)
    enriched.update(kg)

    # Study mode mastery
    try:
        from app.services.study_mode_service import get_mastery
        enriched['mastery'] = await get_mastery(db, user_id, book_id)
    except Exception as exc:
        logger.warning('Mastery enrichment skipped for book %s', book_id, exc_info=True)
        enriched['mastery'] = {}

    # Synthesis themes
    enriched['synthesis_themes'] = await enrich_with_synthesis_themes(
        db, user_id, book_id,
    )

    # Reading pace, session details, and first highlight
    metrics = await enrich_reading_metrics(
        data.get('reading_sessions', []),
        data.get('highlights', []),
    )
    enriched.update(metrics)

    # User's other completed books (for recommendations + threads)
    books = await fetch_other_books(db, user_id, book_id)
    enriched.update(books)

    return enriched
