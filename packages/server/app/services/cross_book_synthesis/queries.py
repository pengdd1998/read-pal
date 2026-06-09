"""Batch database queries for cross-book synthesis."""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.reading_session import ReadingSession
from app.services.cross_book_synthesis.builders import assemble_book_data

logger = logging.getLogger(__name__)


# Shared caps (must stay in sync with synthesis_service.py)
MAX_ANNOTATIONS = 50
MAX_CHAT_MESSAGES = 20
MAX_READING_SESSIONS = 50


async def query_books_batch(
  db: AsyncSession, user_id: UUID, book_ids: list[UUID],
) -> dict[UUID, Book]:
  """Load requested books belonging to the user."""
  try:
    result = await db.execute(
      select(Book).where(Book.id.in_(book_ids), Book.user_id == user_id),
    )
    return {b.id: b for b in result.scalars().all()}
  except Exception:
    logger.error('Failed to query books batch for user %s', user_id, exc_info=True)
    return {}


async def query_annotations_batch(
  db: AsyncSession, user_id: UUID, book_ids: list[UUID],
) -> dict[UUID, list[Annotation]]:
  """Load annotations for multiple books, capped per book."""
  try:
    result = await db.execute(
      select(Annotation)
      .where(Annotation.user_id == user_id, Annotation.book_id.in_(book_ids))
      .order_by(Annotation.book_id, Annotation.created_at),
    )
    buckets: dict[UUID, list[Annotation]] = {}
    for ann in result.scalars().all():
      bucket = buckets.setdefault(ann.book_id, [])
      if len(bucket) < MAX_ANNOTATIONS:
        bucket.append(ann)
    return buckets
  except Exception:
    logger.error('Failed to query annotations batch for user %s', user_id, exc_info=True)
    return {}


async def query_messages_batch(
  db: AsyncSession, user_id: UUID, book_ids: list[UUID],
) -> dict[UUID, list[ChatMessage]]:
  """Load chat messages for multiple books, capped per book."""
  try:
    result = await db.execute(
      select(ChatMessage)
      .where(ChatMessage.user_id == user_id, ChatMessage.book_id.in_(book_ids))
      .order_by(ChatMessage.book_id, ChatMessage.created_at),
    )
    buckets: dict[UUID, list[ChatMessage]] = {}
    for msg in result.scalars().all():
      bucket = buckets.setdefault(msg.book_id, [])
      if len(bucket) < MAX_CHAT_MESSAGES:
        bucket.append(msg)
    return buckets
  except Exception:
    logger.error('Failed to query messages batch for user %s', user_id, exc_info=True)
    return {}


async def query_sessions_batch(
  db: AsyncSession, user_id: UUID, book_ids: list[UUID],
) -> dict[UUID, list[ReadingSession]]:
  """Load reading sessions for multiple books, capped per book."""
  try:
    result = await db.execute(
      select(ReadingSession)
      .where(
        ReadingSession.user_id == user_id,
        ReadingSession.book_id.in_(book_ids),
      )
      .order_by(ReadingSession.book_id, ReadingSession.started_at),
    )
    buckets: dict[UUID, list[ReadingSession]] = {}
    for sess in result.scalars().all():
      bucket = buckets.setdefault(sess.book_id, [])
      if len(bucket) < MAX_READING_SESSIONS:
        bucket.append(sess)
    return buckets
  except Exception:
    logger.error('Failed to query sessions batch for user %s', user_id, exc_info=True)
    return {}


async def batch_collect_reading_data(
  db: AsyncSession,
  user_id: UUID,
  book_ids: list[UUID],
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> dict[UUID, dict[str, Any]]:
  """Collect reading data for multiple books using batch queries.

  Replaces N calls to per-book collection (4 queries each = 4N total)
  with 4 batch queries total, then partitions results in Python.
  """
  coros = [
    query_books_batch(db, user_id, book_ids),
    query_annotations_batch(db, user_id, book_ids),
    query_sessions_batch(db, user_id, book_ids),
  ]
  if include_conversations:
    coros.insert(2, query_messages_batch(db, user_id, book_ids))

  results = await asyncio.gather(*coros)
  books = results[0]
  all_annotations = results[1]
  all_messages = results[2] if include_conversations else {}
  all_sessions = results[3] if include_conversations else results[2]
  return assemble_book_data(
    book_ids, books, all_annotations, all_messages, all_sessions,
    include_highlights, include_notes, include_conversations,
  )


async def get_user_book_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
  """Return all book IDs owned by the given user."""
  try:
    result = await db.execute(
      select(Book.id).where(Book.user_id == user_id),
    )
    return [row[0] for row in result.all()]
  except Exception:
    logger.error('Failed to get user book IDs for user %s', user_id, exc_info=True)
    return []
