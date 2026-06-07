"""Rate-limit retry — exponential backoff for 429 responses."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Rate-limit retry
# ---------------------------------------------------------------------------

_RATE_LIMIT_BACKOFFS = [2, 4, 8]  # seconds to wait between 429 retries


def _is_rate_limited(exc: Exception) -> bool:
    """Check if an exception indicates a 429 rate limit response."""
    msg = str(exc).lower()
    return '429' in msg or 'rate' in msg


async def _invoke_with_retry(
    llm: ChatOpenAI,
    messages: list[BaseMessage],
    log_label: str,
) -> Any:
    """Invoke LLM with exponential backoff on 429 rate limit errors."""
    last_exc: Exception | None = None
    for attempt, backoff in enumerate(_RATE_LIMIT_BACKOFFS):
        try:
            return await llm.ainvoke(messages)
        except Exception as exc:
            last_exc = exc
            if _is_rate_limited(exc) and attempt < len(_RATE_LIMIT_BACKOFFS):
                logger.warning(
                    'llm_rate_limited',
                    label=log_label,
                    attempt=attempt + 1,
                    max_attempts=len(_RATE_LIMIT_BACKOFFS),
                    backoff_seconds=backoff,
                )
                await asyncio.sleep(backoff)
                continue
            raise
    raise last_exc  # type: ignore[misc]
