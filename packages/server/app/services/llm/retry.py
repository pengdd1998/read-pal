"""Rate-limit retry — exponential backoff for 429 responses.

P1.1: respects ``Retry-After`` header on 429s (the openai SDK exposes it via
``RateLimitError.retry_after`` or ``exc.response.headers['Retry-After']``).
Falls back to a configurable exponential backoff when the header is absent.
"""

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
from openai import APIConnectionError, APITimeoutError, RateLimitError

logger = structlog.get_logger('read-pal.llm')

# ---------------------------------------------------------------------------
# Rate-limit retry
# ---------------------------------------------------------------------------

# On a 429 we retry with exponential backoff. When the vendor includes a
# ``Retry-After`` header we honor it; otherwise we fall back to this schedule.
# GLM's account-level rate limit (code 1302) is a sustained quota, not a
# transient blip — but other 429s (per-key burst limits) are genuinely
# transient. The circuit breaker (opens after N failures) is the real
# sustained-failure protection.
_RATE_LIMIT_BACKOFFS = [5, 15]  # seconds; one less than max_attempts
MAX_NETWORK_RETRIES = 1  # retry network errors once before bubbling
_NETWORK_RETRY_DELAY = 2  # seconds to wait before retrying network errors

# Cap total retry wait so accumulated backoff can't blow past the call SLA.
# Vendor calls are themselves bounded by ``LLM_TIMEOUT_SECONDS``; this caps
# only the inter-retry sleep budget.
_MAX_BACKOFF_TOTAL_SECONDS = 30

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


def _extract_retry_after(exc: RateLimitError) -> int | None:
    """Pull ``Retry-After`` (seconds) from a RateLimitError if present.

    The openai SDK stores it on ``exc.retry_after`` (newer versions) or in
    ``exc.response.headers['Retry-After']``. Returns ``None`` when absent.
    """
    retry_after = getattr(exc, 'retry_after', None)
    if retry_after is not None:
        try:
            return int(retry_after)
        except (TypeError, ValueError):
            return None
    response = getattr(exc, 'response', None)
    if response is not None:
        headers = getattr(response, 'headers', None) or {}
        raw = headers.get('Retry-After') or headers.get('retry-after')
        if raw:
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
    return None


async def _invoke_with_retry(
    llm: ChatOpenAI,
    messages: list[BaseMessage],
    log_label: str,
) -> Any:
    """Invoke LLM with backoff on 429 rate limit errors.

    Backoff resolution: ``Retry-After`` header (when present) > exponential
    schedule (``_RATE_LIMIT_BACKOFFS``). Total backoff wait is capped at
    ``_MAX_BACKOFF_TOTAL_SECONDS`` so the call can't blow past the SLA even
    when the vendor advertises a huge ``Retry-After``.
    """
    last_exc: Exception | None = None
    max_attempts = len(_RATE_LIMIT_BACKOFFS) + 1
    total_slept = 0
    for attempt in range(max_attempts):
        try:
            return await llm.ainvoke(messages)
        except _NETWORK_ERRORS as exc:
            # Network-level errors: retry up to MAX_NETWORK_RETRIES times
            last_exc = exc
            if attempt < MAX_NETWORK_RETRIES:
                logger.warning('llm_network_error', label=log_label, attempt=attempt + 1, error=str(exc)[:200])
                await asyncio.sleep(_NETWORK_RETRY_DELAY)
                continue
            raise
        except OutputParserException:
            # Schema/parse failure — retrying won't help
            raise
        except RateLimitError as exc:
            last_exc = exc
            if attempt < len(_RATE_LIMIT_BACKOFFS):
                # Prefer vendor-provided Retry-After, fall back to schedule
                retry_after = _extract_retry_after(exc)
                backoff = retry_after if retry_after is not None else _RATE_LIMIT_BACKOFFS[attempt]
                # Cap total backoff budget
                remaining = _MAX_BACKOFF_TOTAL_SECONDS - total_slept
                if remaining <= 0:
                    raise
                backoff = min(backoff, remaining)
                logger.warning(
                    'llm_rate_limited',
                    label=log_label,
                    attempt=attempt + 1,
                    max_attempts=max_attempts,
                    backoff_seconds=backoff,
                    retry_after_header=retry_after,
                )
                await asyncio.sleep(backoff)
                total_slept += backoff
                continue
            raise
        # P4.4: removed redundant ``except Exception: raise`` block —
        # Python bubbles uncaught exceptions naturally, and the
        # ``as exc`` was never read. ``test_non_rate_limit_error_bubbles_immediately``
        # still passes because bubble behavior is preserved by default.
    raise last_exc  # type: ignore[misc]
