"""Per-source data fetchers for Reading Mirror collection."""

from __future__ import annotations

import structlog
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.flashcard import Flashcard
from app.models.reading_session import ReadingSession
from app.utils.annotations import match_annotation_type
from app.utils.db import db_error_guard
from app.utils.limits import (
    DATA_COLLECTION_ANNOTATION_LIMIT,
    DATA_COLLECTION_CHAT_LIMIT,
    DATA_COLLECTION_FLASHCARD_LIMIT,
    DATA_COLLECTION_SESSION_LIMIT,
)
from app.utils.sanitizer import sanitize_user_input

logger = structlog.get_logger('read-pal.memory_book')


async def _fetch_book_meta(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any] | None:
    """Fetch book metadata or return None if not found."""
    try:
        async with db_error_guard('fetch_book_meta', book_id=str(book_id)):
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
    except DBAPIError:
        logger.warning('collectors._fetch_book_meta failed book_id=%s', book_id, exc_info=True)
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
        async with db_error_guard('fetch_annotations', book_id=str(book_id)):
            result = await db.execute(
                select(Annotation)
                .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
                .order_by(Annotation.created_at)
                .limit(DATA_COLLECTION_ANNOTATION_LIMIT),
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
    except DBAPIError:
        logger.warning('collectors._fetch_annotations failed book_id=%s', book_id, exc_info=True)
        return [], []


async def _fetch_conversations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Fetch chat messages for the book."""
    try:
        async with db_error_guard('fetch_conversations', book_id=str(book_id)):
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.user_id == user_id, ChatMessage.book_id == book_id)
                .order_by(ChatMessage.created_at)
                .limit(DATA_COLLECTION_CHAT_LIMIT),
            )
            messages = list(result.scalars().all())
            return [
                {
                    'role': m.role,
                    'content': sanitize_user_input(m.content, context='chat_message'),
                }
                for m in messages
            ]
    except DBAPIError:
        logger.warning('collectors._fetch_conversations failed book_id=%s', book_id, exc_info=True)
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
        async with db_error_guard('fetch_reading_sessions', book_id=str(book_id)):
            result = await db.execute(
                select(ReadingSession)
                .where(ReadingSession.user_id == user_id, ReadingSession.book_id == book_id)
                .order_by(ReadingSession.started_at)
                .limit(DATA_COLLECTION_SESSION_LIMIT),
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
    except DBAPIError:
        logger.warning('collectors._fetch_reading_sessions failed book_id=%s', book_id, exc_info=True)
        return [], []


async def _fetch_flashcards(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """Fetch flashcards for the 'What Stuck' section."""
    try:
        async with db_error_guard('fetch_flashcards', book_id=str(book_id)):
            result = await db.execute(
                select(Flashcard)
                .where(Flashcard.user_id == user_id, Flashcard.book_id == book_id)
                .order_by(Flashcard.created_at.desc())
                .limit(DATA_COLLECTION_FLASHCARD_LIMIT),
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
    except DBAPIError:
        logger.warning('collectors._fetch_flashcards failed book_id=%s', book_id, exc_info=True)
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
        'total_reading_minutes': sum((s.duration or 0) for s in sessions) // 60,
        'total_pages_read': sum((s.pages_read or 0) for s in sessions),
    }
