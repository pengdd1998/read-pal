"""Synthesis service — cross-reference analysis across reading data."""

from __future__ import annotations

import json
import logging
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

logger = logging.getLogger('read-pal.synthesis')

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
      'Synthesis prompt truncated: %s', ', '.join(budget.truncations),
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
  )

  return SynthesisResponse(success=True, data=synthesis_data)


async def cross_book_synthesize(
  db: AsyncSession,
  user_id: UUID,
  book_ids: list[UUID],
) -> SynthesisResponse:
  """Synthesize across multiple books — find common themes and connections."""
  all_book_data: list[dict[str, Any]] = []

  for bid in book_ids:
    data = await _collect_reading_data(db, user_id, bid, True, True, False)
    if data.get('book'):
      all_book_data.append(data)

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
      'Cross-book synthesis prompt truncated: %s',
      ', '.join(budget.truncations),
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
  )

  return SynthesisResponse(success=True, data=synthesis_data)
