"""LLM invocation helpers for cross-book synthesis."""

from __future__ import annotations

import json
import structlog
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import (
  BOOK_COMPARE_HUMAN,
  BOOK_COMPARE_SYSTEM,
  CROSS_BOOK_SYNTHESIS_HUMAN,
  CROSS_BOOK_SYNTHESIS_SYSTEM,
)
from app.schemas.llm_outputs import CrossBookComparison
from app.services.llm import safe_llm_invoke
from app.services.cross_book_synthesis.builders import condense_book
from app.utils.sanitizer import sanitize_book_field
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.synthesis')


async def run_synthesis_llm(
  condensed: list[dict],
  user_id: UUID,
) -> dict[str, Any]:
  """Call LLM for cross-book synthesis with token budgeting."""
  budget = TokenBudget()
  budgeted = budget.add(json.dumps(condensed, default=str), 'cross_book_data')
  if budget.truncations:
    logger.warning(
      'cross_book_synthesis_prompt_truncated',
      truncations=', '.join(budget.truncations),
    )

  system_prompt = CROSS_BOOK_SYNTHESIS_SYSTEM.template
  human_prompt = CROSS_BOOK_SYNTHESIS_HUMAN.template.format(data=budgeted)
  return await safe_llm_invoke(
    [
      SystemMessage(content=system_prompt),
      HumanMessage(content=human_prompt),
    ],
    fallback=CrossBookComparison().model_dump(),
    log_label='Cross-book synthesis',
    schema_class=CrossBookComparison,
    user_id=str(user_id),
    book_id=None,
    template=CROSS_BOOK_SYNTHESIS_SYSTEM,
  )


async def run_comparison_llm(
  data_1: dict[str, Any],
  data_2: dict[str, Any],
  user_id: UUID,
) -> dict[str, Any]:
  """Call LLM for book comparison with token budgeting."""
  budget = TokenBudget()
  condensed_1 = budget.add(
    json.dumps(condense_book(data_1), default=str), 'book_1_data',
  )
  condensed_2 = budget.add(
    json.dumps(condense_book(data_2), default=str), 'book_2_data',
  )

  book_1, book_2 = data_1['book'], data_2['book']
  system_prompt = BOOK_COMPARE_SYSTEM.template
  human_prompt = BOOK_COMPARE_HUMAN.template.format(
    title_1=sanitize_book_field(book_1.get('title'), field='title'),
    author_1=sanitize_book_field(book_1.get('author'), field='author'),
    title_2=sanitize_book_field(book_2.get('title'), field='title'),
    author_2=sanitize_book_field(book_2.get('author'), field='author'),
    data_1=condensed_1,
    data_2=condensed_2,
  )
  return await safe_llm_invoke(
    [
      SystemMessage(content=system_prompt),
      HumanMessage(content=human_prompt),
    ],
    fallback=CrossBookComparison().model_dump(),
    log_label='Book comparison',
    schema_class=CrossBookComparison,
    user_id=str(user_id),
    book_id=None,
    template=BOOK_COMPARE_SYSTEM,
  )
