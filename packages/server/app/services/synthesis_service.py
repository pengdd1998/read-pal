"""Synthesis service — cross-reference analysis across reading data."""

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
  SYNTHESIS_HUMAN,
  SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import CrossBookComparison, SynthesisResult
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


async def _collect_reading_data(
  db: AsyncSession,
  user_id: UUID,
  book_id: UUID,
  include_highlights: bool = True,
  include_notes: bool = True,
  include_conversations: bool = True,
) -> dict[str, Any]:
  """Collect all reading data for synthesis."""
  data: dict[str, Any] = {}

  # Load book info
  result = await db.execute(
    select(Book).where(Book.id == book_id, Book.user_id == user_id),
  )
  book = result.scalar_one_or_none()
  if book is None:
    return data

  data['book'] = {
    'title': book.title,
    'author': book.author,
    'progress': float(book.progress),
    'status': book.status,
  }

  # Load annotations (highlights + notes), capped at _MAX_ANNOTATIONS
  conditions = [
    Annotation.user_id == user_id,
    Annotation.book_id == book_id,
  ]
  result = await db.execute(
    select(Annotation).where(*conditions).order_by(Annotation.created_at).limit(_MAX_ANNOTATIONS),
  )
  annotations = list(result.scalars().all())

  if include_highlights:
    highlights = [
      {
        'content': sanitize_annotations(a.content or ''),
        'note': sanitize_annotations(a.note or ''),
        'tags': a.tags,
      }
      for a in annotations
      if match_annotation_type(a.type, AnnotationType.highlight)
    ]
    data['highlights'] = highlights

  if include_notes:
    notes = [
      {
        'content': sanitize_annotations(a.content or ''),
        'note': sanitize_annotations(a.note or ''),
        'tags': a.tags,
      }
      for a in annotations
      if match_annotation_type(a.type, AnnotationType.note)
    ]
    data['notes'] = notes

  # Load chat conversations (capped at _MAX_CHAT_MESSAGES)
  if include_conversations:
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
    data['conversations'] = [
      {
        'role': m.role,
        'content': sanitize_chat_message(m.content or ''),
      }
      for m in messages
    ]

  # Load reading sessions for timeline (capped at _MAX_READING_SESSIONS)
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

  return data


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
    db,
    user_id,
    book_id,
    include_highlights,
    include_notes,
    include_conversations,
  )

  if not reading_data.get('book'):
    return SynthesisResponse(
      success=False,
      data={'error': 'Book not found'},
    )

  # Token-budget the serialized data to avoid 50K+ char dumps
  budget = TokenBudget()
  serialized_data = json.dumps(reading_data, default=str)
  budgeted_data = budget.add(serialized_data, 'reading_data')
  if budget.truncations:
    logger.warning(
      'synthesis_prompt_truncated',
      truncations=', '.join(budget.truncations),
    )

  system_prompt = SYNTHESIS_SYSTEM.template
  book_title = reading_data['book']['title']
  book_author = reading_data['book']['author']
  human_prompt = SYNTHESIS_HUMAN.template.format(
    title=book_title,
    author=book_author,
    data=budgeted_data,
  )

  empty_synthesis = SynthesisResult().model_dump()
  synthesis_data = await safe_llm_invoke(
    [
      SystemMessage(content=system_prompt),
      HumanMessage(content=human_prompt),
    ],
    fallback=empty_synthesis,
    log_label='Synthesis',
    schema_class=SynthesisResult,
    user_id=str(user_id),
    book_id=str(book_id),
  )

  themes_count = len(synthesis_data.get('themes', []))
  connections_count = len(synthesis_data.get('connections', []))
  elapsed = (time.monotonic() - t0) * 1000
  logger.info(
    'synthesis.synthesize.completed',
    book_id=str(book_id),
    themes_count=themes_count,
    connections_count=connections_count,
    latency_ms=round(elapsed, 1),
  )

  return SynthesisResponse(success=True, data=synthesis_data)


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

  # Build condensed data per book (already sanitized in _collect_reading_data)
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


async def compare_books(
  db: AsyncSession,
  user_id: UUID,
  book_id_1: UUID,
  book_id_2: UUID,
) -> SynthesisResponse:
  """Compare two books — find common themes and unique perspectives."""
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

  def _condense(bd: dict[str, Any]) -> str:
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

  budget = TokenBudget()
  condensed_1 = budget.add(_condense(data_1), 'book_1_data')
  condensed_2 = budget.add(_condense(data_2), 'book_2_data')

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
