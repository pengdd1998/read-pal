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
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts import (
  SYNTHESIS_HUMAN,
  SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import SynthesisResult
from app.schemas.synthesis import SynthesisResponse
from app.services.llm import safe_llm_invoke
from app.services.synthesis.data_loaders import collect_reading_data
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.synthesis')


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

  reading_data = await collect_reading_data(
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
    template=SYNTHESIS_SYSTEM,
  )

  elapsed_ms = (time.monotonic() - t0) * 1000
  _log_synthesis_result(synthesis_data, book_id, elapsed_ms)

  return SynthesisResponse(success=True, data=synthesis_data)
