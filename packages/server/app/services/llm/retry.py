"""Rate-limit retry — exponential backoff for 429 responses."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from langchain_core.messages import BaseMessage
from langchain_core.exceptions import OutputParserException
from langchain_openai import ChatOpenAI

# openai is a hard dependency of langchain_openai; its connection/timeout
# errors are what langchain actually raises on network failures (the builtin
# ConnectionError/TimeoutError are NOT raised by the SDK, so without these the
# "retry once on network error" branch below was dead).
from openai import APIConnectionError, APITimeoutError

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Rate-limit retry
# ---------------------------------------------------------------------------

# On a 429 we retry once after a short backoff. GLM's account-level rate limit
# (code 1302) is a sustained quota, not a transient blip — retrying many times
# just multiplies the call volume and deepens the throttle (thundering herd).
# The circuit breaker (opens after N failures) is the real sustained-failure
# protection; this single retry only catches genuinely transient 429s.
_RATE_LIMIT_BACKOFFS = [5]  # seconds to wait before the single 429 retry
_NETWORK_RETRY_DELAY = 2  # seconds to wait before retrying network errors

# Transient errors that warrant a single retry: stdlib socket-level errors,
# asyncio timeouts, and the openai SDK's connection/timeout errors (which do
# not subclass the stdlib types).
_NETWORK_ERRORS = (
    ConnectionError,
    TimeoutError,
    asyncio.TimeoutError,
    APIConnectionError,
    APITimeoutError,
)


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
        except _NETWORK_ERRORS as exc:
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
