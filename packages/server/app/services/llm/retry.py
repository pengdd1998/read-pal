"""Rate-limit retry — exponential backoff for 429 responses."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from langchain_core.messages import BaseMessage
from langchain_core.exceptions import OutputParserException
from langchain_openai import ChatOpenAI

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Rate-limit retry
# ---------------------------------------------------------------------------

_RATE_LIMIT_BACKOFFS = [2, 4, 8]  # seconds to wait between 429 retries
_NETWORK_RETRY_DELAY = 2  # seconds to wait before retrying network errors


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
    max_attempts = len(_RATE_LIMIT_BACKOFFS) + 1
    for attempt in range(max_attempts):
        try:
            return await llm.ainvoke(messages)
        except (ConnectionError, TimeoutError, asyncio.TimeoutError) as exc:
            # Network-level errors: retry once
            last_exc = exc
            if attempt < 1:
                logger.warning('llm_network_error', label=log_label, error=str(exc)[:200])
                await asyncio.sleep(_NETWORK_RETRY_DELAY)
                continue
            raise
        except OutputParserException:
            raise
        except Exception as exc:
            last_exc = exc
            if _is_rate_limited(exc) and attempt < len(_RATE_LIMIT_BACKOFFS):
                backoff = _RATE_LIMIT_BACKOFFS[attempt]
                logger.warning(
                    'llm_rate_limited',
                    label=log_label,
                    attempt=attempt + 1,
                    max_attempts=max_attempts,
                    backoff_seconds=backoff,
                )
                await asyncio.sleep(backoff)
                continue
            raise
    raise last_exc  # type: ignore[misc]
