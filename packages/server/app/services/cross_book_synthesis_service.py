"""Cross-book synthesis service — multi-book analysis and comparison.

Extracted from synthesis_service.py so that single-book synthesis stays
focused while cross-book operations live separately.

Implementation lives in the ``cross_book_synthesis`` sub-package; this
module re-exports the public API for backward compatibility.
"""

from __future__ import annotations

import structlog
import time
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.synthesis import SynthesisResponse
from app.services.cross_book_synthesis import (  # noqa: F401
  batch_collect_reading_data,
  condense_book_data,
  get_user_book_ids,
  run_comparison_llm,
  run_synthesis_llm,
)

logger = structlog.get_logger('read-pal.synthesis')


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_synthesis_fallback(data: dict[str, Any]) -> bool:
  """Detect if synthesis LLM returned the empty fallback (all fields empty).

  ``run_synthesis_llm`` validates against the ``CrossBookComparison`` schema, so
  the populated keys are ``common_themes`` / ``unique_perspectives`` /
  ``recommended_connections`` — not ``themes`` / ``connections`` / ``insights``.
  """
  return (
    len(data.get('common_themes', [])) == 0
    and len(data.get('unique_perspectives', [])) == 0
    and len(data.get('recommended_connections', [])) == 0
  )


def _is_comparison_fallback(data: dict[str, Any]) -> bool:
  """Detect if comparison LLM returned the empty fallback (all fields empty)."""
  common_themes = data.get('common_themes', [])
  unique_perspectives = data.get('unique_perspectives', [])
  recommended_connections = data.get('recommended_connections', [])
  return (
    len(common_themes) == 0
    and len(unique_perspectives) == 0
    and len(recommended_connections) == 0
  )


# ---------------------------------------------------------------------------
# Public API (backward-compatible function signatures)
# ---------------------------------------------------------------------------

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

  data_map = await batch_collect_reading_data(
    db, user_id, book_ids, True, True, False,
  )
  all_book_data = [data_map[bid] for bid in book_ids if bid in data_map]

  if not all_book_data:
    return SynthesisResponse(
      success=True,
      data={'themes': [], 'connections': [], 'book_summaries': []},
    )

  condensed = condense_book_data(all_book_data)
  synthesis_data = await run_synthesis_llm(condensed, user_id)

  is_fallback = _is_synthesis_fallback(synthesis_data)
  if is_fallback:
    synthesis_data['error'] = 'AI analysis unavailable - showing partial results'

  themes_count = len(synthesis_data.get('common_themes', []))
  connections_count = len(synthesis_data.get('unique_perspectives', []))
  elapsed = (time.monotonic() - t0) * 1000
  logger.info(
    'synthesis.cross_book.completed',
    book_count=len(book_ids),
    themes_count=themes_count,
    connections_count=connections_count,
    latency_ms=round(elapsed, 1),
  )
  return SynthesisResponse(
    success=not is_fallback,
    data=synthesis_data,
    error=synthesis_data.get('error') if is_fallback else None,
  )


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

  data_map = await batch_collect_reading_data(
    db, user_id, [book_id_1, book_id_2], True, True, False,
  )
  data_1 = data_map.get(book_id_1, {})
  data_2 = data_map.get(book_id_2, {})

  if not data_1.get('book') or not data_2.get('book'):
    return SynthesisResponse(
      success=False,
      data={'error': 'One or both books not found'},
    )

  comparison_data = await run_comparison_llm(data_1, data_2, user_id)

  is_fallback = _is_comparison_fallback(comparison_data)
  if is_fallback:
    comparison_data['error'] = 'AI analysis unavailable - showing partial results'

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
  return SynthesisResponse(
    success=not is_fallback,
    data=comparison_data,
    error=comparison_data.get('error') if is_fallback else None,
  )
