"""Data loaders for synthesis — book info, annotations, conversations, sessions."""

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
from app.models.reading_session import ReadingSession
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_annotations, sanitize_chat_message

logger = structlog.get_logger('read-pal.synthesis')

# Hard caps on data volume passed to the LLM
MAX_ANNOTATIONS = 50
MAX_CHAT_MESSAGES = 20
MAX_READING_SESSIONS = 50


async def load_book_info(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
) -> dict[str, Any] | None:
  """Load book metadata; returns None if book not found."""
  try:
    result = await db.execute(
      select(Book).where(Book.id == book_id, Book.user_id == user_id),
    )
    book = result.scalar_one_or_none()
    if book is None:
      return None
    return {
      'title': book.title,
      'author': book.author,
      'progress': float(book.progress),
      'status': book.status,
    }
  except (DBAPIError, OSError):
    logger.warning(
      'synthesis load_book_info failed: book=%s user=%s',
      book_id, user_id, exc_info=True,
    )
    return None


def split_annotations(
  annotations: list[Annotation],
  include_highlights: bool,
  include_notes: bool,
) -> dict[str, list[dict]]:
  """Split annotation rows into highlights and notes lists."""
  result: dict[str, list[dict]] = {}
  if include_highlights:
    result['highlights'] = [
      {
        'content': sanitize_annotations(a.content or ''),
        'note': sanitize_annotations(a.note or ''),
        'tags': a.tags,
      }
      for a in annotations
      if match_annotation_type(a.type, AnnotationType.highlight)
    ]
  if include_notes:
    result['notes'] = [
      {
        'content': sanitize_annotations(a.content or ''),
        'note': sanitize_annotations(a.note or ''),
        'tags': a.tags,
      }
      for a in annotations
      if match_annotation_type(a.type, AnnotationType.note)
    ]
  return result


async def load_conversations(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
) -> list[dict]:
  """Load chat conversations for synthesis (capped at MAX_CHAT_MESSAGES)."""
  try:
    result = await db.execute(
      select(ChatMessage)
      .where(
        ChatMessage.user_id == user_id,
        ChatMessage.book_id == book_id,
      )
      .order_by(ChatMessage.created_at)
      .limit(MAX_CHAT_MESSAGES),
    )
    messages = list(result.scalars().all())
    return [
      {
        'role': m.role,
        'content': sanitize_chat_message(m.content or ''),
      }
      for m in messages
    ]
  except (DBAPIError, OSError):
    logger.warning(
      'synthesis load_conversations failed: book=%s user=%s',
      book_id, user_id, exc_info=True,
    )
    return []


async def load_reading_sessions(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
) -> list[dict]:
  """Load reading sessions for timeline (capped at MAX_READING_SESSIONS)."""
  try:
    result = await db.execute(
      select(ReadingSession)
      .where(
        ReadingSession.user_id == user_id,
        ReadingSession.book_id == book_id,
      )
      .order_by(ReadingSession.started_at)
      .limit(MAX_READING_SESSIONS),
    )
    sessions = list(result.scalars().all())
    return [
      {
        'started_at': s.started_at.isoformat() if s.started_at else None,
        'duration': s.duration,
        'pages_read': s.pages_read,
        'highlights': s.highlights,
        'notes': s.notes,
      }
      for s in sessions
    ]
  except (DBAPIError, OSError):
    logger.warning(
      'synthesis load_reading_sessions failed: book=%s user=%s',
      book_id, user_id, exc_info=True,
    )
    return []


async def collect_reading_data(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> dict[str, Any]:
  """Collect all reading data for synthesis."""
  try:
    book_info = await load_book_info(db, user_id, book_id)
    if book_info is None:
      return {}

    data: dict[str, Any] = {'book': book_info}

    # Load annotations (highlights + notes), capped at MAX_ANNOTATIONS
    result = await db.execute(
      select(Annotation)
      .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
      .order_by(Annotation.created_at)
      .limit(MAX_ANNOTATIONS),
    )
    annotations = list(result.scalars().all())
    data.update(split_annotations(annotations, include_highlights, include_notes))

    # Chat conversations
    if include_conversations:
      data['conversations'] = await load_conversations(db, user_id, book_id)

    # Reading sessions
    data['reading_sessions'] = await load_reading_sessions(db, user_id, book_id)

    return data
  except (DBAPIError, OSError):
    logger.warning(
      'synthesis collect_reading_data failed: book=%s user=%s',
      book_id, user_id, exc_info=True,
    )
    return {}
