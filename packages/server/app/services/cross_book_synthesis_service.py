"""Cross-book synthesis service — multi-book analysis and comparison.

Extracted from synthesis_service.py so that single-book synthesis stays
focused while cross-book operations live separately.
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
  BOOK_COMPARE_HUMAN,
  BOOK_COMPARE_SYSTEM,
  CROSS_BOOK_SYNTHESIS_HUMAN,
  CROSS_BOOK_SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import CrossBookComparison
from app.schemas.synthesis import SynthesisResponse
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_annotations, sanitize_chat_message
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.synthesis')

# Shared caps (must stay in sync with synthesis_service.py)
_MAX_ANNOTATIONS = 50
_MAX_CHAT_MESSAGES = 20
_MAX_READING_SESSIONS = 50


async def _batch_collect_reading_data(
  db: AsyncSession,
  user_id: UUID,
  book_ids: list[UUID],
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> dict[UUID, dict[str, Any]]:
  """Collect reading data for multiple books using batch queries.

  Replaces N calls to ``_collect_reading_data`` (4 queries each = 4N total)
  with 4 batch queries total, then partitions results in Python.
  """
  # Batch 1: books
  result = await db.execute(
    select(Book).where(Book.id.in_(book_ids), Book.user_id == user_id),
  )
  books = {b.id: b for b in result.scalars().all()}

  # Batch 2: annotations (capped globally, partitioned per book later)
  result = await db.execute(
    select(Annotation)
    .where(
      Annotation.user_id == user_id,
      Annotation.book_id.in_(book_ids),
    )
    .order_by(Annotation.book_id, Annotation.created_at),
  )
  all_annotations: dict[UUID, list[Annotation]] = {}
  for ann in result.scalars().all():
    all_annotations.setdefault(ann.book_id, [])
    if len(all_annotations[ann.book_id]) < _MAX_ANNOTATIONS:
      all_annotations[ann.book_id].append(ann)

  # Batch 3: chat messages (only if needed)
  all_messages: dict[UUID, list[ChatMessage]] = {}
  if include_conversations:
    result = await db.execute(
      select(ChatMessage)
      .where(
        ChatMessage.user_id == user_id,
        ChatMessage.book_id.in_(book_ids),
      )
      .order_by(ChatMessage.book_id, ChatMessage.created_at),
    )
    for msg in result.scalars().all():
      all_messages.setdefault(msg.book_id, [])
      if len(all_messages[msg.book_id]) < _MAX_CHAT_MESSAGES:
        all_messages[msg.book_id].append(msg)

  # Batch 4: reading sessions
  result = await db.execute(
    select(ReadingSession)
    .where(
      ReadingSession.user_id == user_id,
      ReadingSession.book_id.in_(book_ids),
    )
    .order_by(ReadingSession.book_id, ReadingSession.started_at),
  )
  all_sessions: dict[UUID, list[ReadingSession]] = {}
  for sess in result.scalars().all():
    all_sessions.setdefault(sess.book_id, [])
    if len(all_sessions[sess.book_id]) < _MAX_READING_SESSIONS:
      all_sessions[sess.book_id].append(sess)

  # Assemble per-book data dicts
  return _assemble_book_data(
    book_ids, books, all_annotations, all_messages, all_sessions,
    include_highlights, include_notes, include_conversations,
  )


def _assemble_book_data(
  book_ids: list[UUID],
  books: dict[UUID, Book],
  all_annotations: dict[UUID, list[Annotation]],
  all_messages: dict[UUID, list[ChatMessage]],
  all_sessions: dict[UUID, list[ReadingSession]],
  include_highlights: bool,
  include_notes: bool,
  include_conversations: bool,
) -> dict[UUID, dict[str, Any]]:
  """Assemble per-book data dicts from batch-loaded records."""
  from app.utils.annotations import match_annotation_type

  data_map: dict[UUID, dict[str, Any]] = {}
  for bid in book_ids:
    book = books.get(bid)
    if book is None:
      continue
    data: dict[str, Any] = {
      'book': {
        'title': book.title,
        'author': book.author,
        'progress': float(book.progress),
        'status': book.status,
      },
    }
    annotations = all_annotations.get(bid, [])
    if include_highlights:
      data['highlights'] = [
        {
          'content': sanitize_annotations(a.content or ''),
          'note': sanitize_annotations(a.note or ''),
          'tags': a.tags,
        }
        for a in annotations
        if match_annotation_type(a.type, AnnotationType.highlight)
      ]
    if include_notes:
      data['notes'] = [
        {
          'content': sanitize_annotations(a.content or ''),
          'note': sanitize_annotations(a.note or ''),
          'tags': a.tags,
        }
        for a in annotations
        if match_annotation_type(a.type, AnnotationType.note)
      ]
    if include_conversations:
      messages = all_messages.get(bid, [])
      data['conversations'] = [
        {
          'role': m.role,
          'content': sanitize_chat_message(m.content or ''),
        }
        for m in messages
      ]
    sessions = all_sessions.get(bid, [])
    data['reading_sessions'] = [
      {
        'started_at': s.started_at.isoformat() if s.started_at else None,
        'duration': s.duration,
        'pages_read': s.pages_read,
        'highlights': s.highlights,
        'notes': s.notes,
      }
      for s in sessions
    ]
    data_map[bid] = data
  return data_map


async def get_user_book_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
  """Return all book IDs owned by the given user."""
  result = await db.execute(
    select(Book.id).where(Book.user_id == user_id),
  )
  return [row[0] for row in result.all()]


async def cross_book_synthesize(
  db: AsyncSession,
  user_id: UUID,
  book_ids: list[UUID],
) -> SynthesisResponse:
  """Synthesize across multiple books — find common themes and connections."""
  t0 = time.monotonic()
  logger.info(
    'synthesis.cross_book.started',
    book_count=len(book_ids),
    user_id=str(user_id),
  )

  # Batch-load reading data for all books (4 queries total, not 4N)
  data_map = await _batch_collect_reading_data(
    db, user_id, book_ids, True, True, False,
  )
  all_book_data = [data_map[bid] for bid in book_ids if bid in data_map]

  if not all_book_data:
    return SynthesisResponse(
      success=True,
      data={'themes': [], 'connections': [], 'book_summaries': []},
    )

  condensed = _condense_book_data(all_book_data)

  # Token-budget the cross-book data
  budget = TokenBudget()
  serialized_condensed = json.dumps(condensed, default=str)
  budgeted_condensed = budget.add(serialized_condensed, 'cross_book_data')
  if budget.truncations:
    logger.warning(
      'cross_book_synthesis_prompt_truncated',
      truncations=', '.join(budget.truncations),
    )

  system_prompt = CROSS_BOOK_SYNTHESIS_SYSTEM.template
  human_prompt = CROSS_BOOK_SYNTHESIS_HUMAN.template.format(
    data=budgeted_condensed,
  )

  fallback = CrossBookComparison().model_dump()
  synthesis_data = await safe_llm_invoke(
    [
      SystemMessage(content=system_prompt),
      HumanMessage(content=human_prompt),
    ],
    fallback=fallback,
    log_label='Cross-book synthesis',
    schema_class=CrossBookComparison,
    user_id=str(user_id),
    book_id=None,
  )

  themes_count = len(synthesis_data.get('themes', []))
  connections_count = len(synthesis_data.get('connections', []))
  elapsed = (time.monotonic() - t0) * 1000
  logger.info(
    'synthesis.cross_book.completed',
    book_count=len(book_ids),
    themes_count=themes_count,
    connections_count=connections_count,
    latency_ms=round(elapsed, 1),
  )

  return SynthesisResponse(success=True, data=synthesis_data)


def _condense_book_data(all_book_data: list[dict[str, Any]]) -> list[dict]:
  """Build condensed per-book summaries for cross-book prompts."""
  condensed = []
  for bd in all_book_data:
    book = bd.get('book', {})
    highlights = [
      sanitize_annotations(h.get('content', '')[:100])
      for h in bd.get('highlights', [])[:10]
    ]
    notes = [
      sanitize_annotations(n.get('content', '')[:100])
      for n in bd.get('notes', [])[:5]
    ]
    condensed.append({
      'title': book.get('title'),
      'author': book.get('author'),
      'highlights': highlights,
      'notes': notes,
    })
  return condensed


async def compare_books(
  db: AsyncSession,
  user_id: UUID,
  book_id_1: UUID,
  book_id_2: UUID,
) -> SynthesisResponse:
  """Compare two books — find common themes and unique perspectives."""
  from app.services.synthesis_service import _collect_reading_data

  t0 = time.monotonic()
  logger.info(
    'synthesis.compare.started',
    book_id_1=str(book_id_1),
    book_id_2=str(book_id_2),
    user_id=str(user_id),
  )

  data_1 = await _collect_reading_data(db, user_id, book_id_1, True, True, False)
  data_2 = await _collect_reading_data(db, user_id, book_id_2, True, True, False)

  if not data_1.get('book') or not data_2.get('book'):
    return SynthesisResponse(
      success=False,
      data={'error': 'One or both books not found'},
    )

  budget = TokenBudget()
  condensed_1 = budget.add(_condense_single(data_1), 'book_1_data')
  condensed_2 = budget.add(_condense_single(data_2), 'book_2_data')

  book_1 = data_1['book']
  book_2 = data_2['book']
  system_prompt = BOOK_COMPARE_SYSTEM.template
  human_prompt = BOOK_COMPARE_HUMAN.template.format(
    title_1=book_1['title'],
    author_1=book_1['author'],
    title_2=book_2['title'],
    author_2=book_2['author'],
    data_1=condensed_1,
    data_2=condensed_2,
  )

  fallback = CrossBookComparison().model_dump()
  comparison_data = await safe_llm_invoke(
    [
      SystemMessage(content=system_prompt),
      HumanMessage(content=human_prompt),
    ],
    fallback=fallback,
    log_label='Book comparison',
    schema_class=CrossBookComparison,
    user_id=str(user_id),
    book_id=None,
  )

  themes_count = len(comparison_data.get('common_themes', []))
  perspectives_count = len(comparison_data.get('unique_perspectives', []))
  elapsed = (time.monotonic() - t0) * 1000
  logger.info(
    'synthesis.compare.completed',
    book_id_1=str(book_id_1),
    book_id_2=str(book_id_2),
    themes_count=themes_count,
    perspectives_count=perspectives_count,
    latency_ms=round(elapsed, 1),
  )

  return SynthesisResponse(success=True, data=comparison_data)


def _condense_single(bd: dict[str, Any]) -> str:
  """Condense a single book's data for the comparison prompt."""
  book = bd.get('book', {})
  highlights = [
    sanitize_annotations(h.get('content', '')[:100])
    for h in bd.get('highlights', [])[:10]
  ]
  notes = [
    sanitize_annotations(n.get('content', '')[:100])
    for n in bd.get('notes', [])[:5]
  ]
  return json.dumps({
    'title': book.get('title'),
    'author': book.get('author'),
    'highlights': highlights,
    'notes': notes,
  }, default=str)
