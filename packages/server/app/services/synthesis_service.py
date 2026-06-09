"""Synthesis service — single-book cross-reference analysis across reading data.

Cross-book synthesis functions live in
``app.services.cross_book_synthesis_service``.
"""

from __future__ import annotations

import json
import structlog
import time
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation, AnnotationType
from app.models.book import Book
from app.models.chat_message import ChatMessage
from app.models.reading_session import ReadingSession
from app.prompts import (
  SYNTHESIS_HUMAN,
  SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import SynthesisResult
from app.schemas.synthesis import SynthesisResponse
from app.services.llm import safe_llm_invoke
from app.utils.annotations import match_annotation_type
from app.utils.sanitizer import sanitize_annotations, sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.synthesis')

# Hard caps on data volume passed to the LLM
_MAX_ANNOTATIONS = 50
_MAX_CHAT_MESSAGES = 20
_MAX_READING_SESSIONS = 50


# ---------------------------------------------------------------------------
# Per-source data loaders
# ---------------------------------------------------------------------------


async def _load_book_info(
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
  except Exception:
    logger.error('Failed to load book info', exc_info=True, book_id=str(book_id), user_id=str(user_id))
    return None


def _split_annotations(
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


async def _load_conversations(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
) -> list[dict]:
  """Load chat conversations for synthesis (capped at _MAX_CHAT_MESSAGES)."""
  try:
    result = await db.execute(
      select(ChatMessage)
      .where(
        ChatMessage.user_id == user_id,
        ChatMessage.book_id == book_id,
      )
      .order_by(ChatMessage.created_at)
      .limit(_MAX_CHAT_MESSAGES),
    )
    messages = list(result.scalars().all())
    return [
      {
        'role': m.role,
        'content': sanitize_chat_message(m.content or ''),
      }
      for m in messages
    ]
  except Exception:
    logger.error('Failed to load conversations', exc_info=True, book_id=str(book_id), user_id=str(user_id))
    return []


async def _load_reading_sessions(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
) -> list[dict]:
  """Load reading sessions for timeline (capped at _MAX_READING_SESSIONS)."""
  try:
    result = await db.execute(
      select(ReadingSession)
      .where(
        ReadingSession.user_id == user_id,
        ReadingSession.book_id == book_id,
      )
      .order_by(ReadingSession.started_at)
      .limit(_MAX_READING_SESSIONS),
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
  except Exception:
    logger.error('Failed to load reading sessions', exc_info=True, book_id=str(book_id), user_id=str(user_id))
    return []


async def _load_chat_and_sessions(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
  include_conversations: bool,
) -> dict[str, Any]:
  """Load chat messages and reading sessions."""
  data: dict[str, Any] = {}
  if include_conversations:
    data['conversations'] = await _load_conversations(db, user_id, book_id)
  data['reading_sessions'] = await _load_reading_sessions(db, user_id, book_id)
  return data


# ---------------------------------------------------------------------------
# Core data collector
# ---------------------------------------------------------------------------


async def _collect_reading_data(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> dict[str, Any]:
  """Collect all reading data for synthesis."""
  try:
    book_info = await _load_book_info(db, user_id, book_id)
    if book_info is None:
      return {}

    data: dict[str, Any] = {'book': book_info}

    # Load annotations (highlights + notes), capped at _MAX_ANNOTATIONS
    result = await db.execute(
      select(Annotation)
      .where(Annotation.user_id == user_id, Annotation.book_id == book_id)
      .order_by(Annotation.created_at)
      .limit(_MAX_ANNOTATIONS),
    )
    annotations = list(result.scalars().all())
    data.update(_split_annotations(annotations, include_highlights, include_notes))

    # Chat conversations + reading sessions
    data.update(await _load_chat_and_sessions(
      db, user_id, book_id, include_conversations,
    ))

    return data
  except Exception:
    logger.error('Failed to collect reading data', exc_info=True, book_id=str(book_id), user_id=str(user_id))
    return {}


def _build_synthesis_prompt(
  reading_data: dict[str, Any],
) -> list:
  """Token-budget the data and build system+human prompt messages."""
  budget = TokenBudget()
  serialized_data = json.dumps(reading_data, default=str)
  budgeted_data = budget.add(serialized_data, 'reading_data')
  if budget.truncations:
    logger.warning(
      'synthesis_prompt_truncated',
      truncations=', '.join(budget.truncations),
    )

  book_title = reading_data['book']['title']
  book_author = reading_data['book']['author']
  human_prompt = SYNTHESIS_HUMAN.template.format(
    title=book_title,
    author=book_author,
    data=budgeted_data,
  )
  return [
    SystemMessage(content=SYNTHESIS_SYSTEM.template),
    HumanMessage(content=human_prompt),
  ]


def _log_synthesis_result(
  synthesis_data: dict[str, Any],
  book_id: UUID,
  elapsed_ms: float,
) -> None:
  """Log synthesis completion metrics."""
  themes_count = len(synthesis_data.get('themes', []))
  connections_count = len(synthesis_data.get('connections', []))
  logger.info(
    'synthesis.synthesize.completed',
    book_id=str(book_id),
    themes_count=themes_count,
    connections_count=connections_count,
    latency_ms=round(elapsed_ms, 1),
  )


async def synthesize(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> SynthesisResponse:
  """Run cross-reference analysis across all reading data for a book.

  Returns structured synthesis with themes, connections, timeline, and insights.
  """
  t0 = time.monotonic()
  logger.info(
    'synthesis.synthesize.started',
    book_id=str(book_id),
    user_id=str(user_id),
    include_highlights=include_highlights,
    include_notes=include_notes,
    include_conversations=include_conversations,
  )

  reading_data = await _collect_reading_data(
    db, user_id, book_id,
    include_highlights, include_notes, include_conversations,
  )

  if not reading_data.get('book'):
    return SynthesisResponse(
      success=False,
      data={'error': 'Book not found'},
    )

  messages = _build_synthesis_prompt(reading_data)

  empty_synthesis = SynthesisResult().model_dump()
  synthesis_data = await safe_llm_invoke(
    messages,
    fallback=empty_synthesis,
    log_label='Synthesis',
    schema_class=SynthesisResult,
    user_id=str(user_id),
    book_id=str(book_id),
  )

  elapsed_ms = (time.monotonic() - t0) * 1000
  _log_synthesis_result(synthesis_data, book_id, elapsed_ms)

  return SynthesisResponse(success=True, data=synthesis_data)
