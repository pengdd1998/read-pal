"""P1.1 tests: respect Retry-After on 429s.

Validates that ``_invoke_with_retry``:
- Catches ``RateLimitError`` specifically (not bare Exception)
- Honors ``Retry-After`` header / ``exc.retry_after`` when present
- Falls back to exponential backoff schedule when header absent
- Caps total backoff at ``_MAX_BACKOFF_TOTAL_SECONDS`` so a huge
  advertised Retry-After can't blow the call SLA
- Lets non-rate-limit errors bubble immediately (no retry)
- Lets ``OutputParserException`` bubble (schema failure — retrying won't help)
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.exceptions import OutputParserException
from openai import APIConnectionError, RateLimitError

from app.services.llm.retry import (
    _MAX_BACKOFF_TOTAL_SECONDS,
    _RATE_LIMIT_BACKOFFS,
    _extract_retry_after,
    _invoke_with_retry,
)


def _make_rate_limit_error(
    retry_after: int | None = None,
    header_value: str | None = None,
) -> RateLimitError:
    """Build a synthetic RateLimitError with optional Retry-After hints."""
    response = MagicMock()
    headers: dict[str, str] = {}
    if header_value is not None:
        headers['Retry-After'] = header_value
    response.headers = headers
    response.request = MagicMock()
    response.http_status = 429

    err = RateLimitError(
        message='rate limited',
        response=response,
        body=None,
    )
    # The SDK doesn't expose retry_after via constructor in all versions;
    # set it post-hoc like the SDK does internally.
    if retry_after is not None:
        err.retry_after = retry_after  # type: ignore[attr-defined]
    return err


# ---------------------------------------------------------------------------
# _extract_retry_after
# ---------------------------------------------------------------------------


class TestExtractRetryAfter:
    def test_uses_exc_retry_after_attribute_first(self):
        err = _make_rate_limit_error(retry_after=12)
        assert _extract_retry_after(err) == 12

    def test_falls_back_to_header_when_attr_absent(self):
        err = _make_rate_limit_error(header_value='8')
        # Clear retry_after so we test the header path
        if hasattr(err, 'retry_after'):
            try:
                del err.retry_after  # type: ignore[attr-defined]
            except AttributeError:
                pass
        # Some SDK versions always set retry_after=None; force it
        err.retry_after = None  # type: ignore[attr-defined]
        assert _extract_retry_after(err) == 8

    def test_returns_none_when_neither_present(self):
        err = _make_rate_limit_error()
        err.retry_after = None  # type: ignore[attr-defined]
        # headers also empty
        assert _extract_retry_after(err) is None

    def test_returns_none_on_garbage_header(self):
        err = _make_rate_limit_error(header_value='not-a-number')
        err.retry_after = None  # type: ignore[attr-defined]
        assert _extract_retry_after(err) is None


# ---------------------------------------------------------------------------
# _invoke_with_retry
# ---------------------------------------------------------------------------


class TestInvokeWithRetry:
    @pytest.mark.asyncio
    async def test_succeeds_first_try(self, monkeypatch):
        llm = MagicMock()
        llm.ainvoke = AsyncMock(return_value='ok')
        result = await _invoke_with_retry(llm, [], 'TEST')
        assert result == 'ok'
        assert llm.ainvoke.await_count == 1

    @pytest.mark.asyncio
    async def test_uses_retry_after_when_present(self, monkeypatch):
        """Vendor-advertised Retry-After is preferred over the schedule."""
        sleeps: list[float] = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)

        monkeypatch.setattr('app.services.llm.retry.asyncio.sleep', fake_sleep)

        err = _make_rate_limit_error(retry_after=7)
        llm = MagicMock()
        llm.ainvoke = AsyncMock(
            side_effect=[err, 'ok'],
        )
        result = await _invoke_with_retry(llm, [], 'TEST')
        assert result == 'ok'
        assert sleeps == [7], f'expected [7], got {sleeps}'

    @pytest.mark.asyncio
    async def test_falls_back_to_schedule_when_header_absent(self, monkeypatch):
        """Without Retry-After, uses _RATE_LIMIT_BACKOFFS schedule."""
        sleeps: list[float] = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)

        monkeypatch.setattr('app.services.llm.retry.asyncio.sleep', fake_sleep)

        err = _make_rate_limit_error()
        err.retry_after = None  # type: ignore[attr-defined]

        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=[err, 'ok'])
        await _invoke_with_retry(llm, [], 'TEST')
        # First schedule entry should be used
        assert sleeps == [_RATE_LIMIT_BACKOFFS[0]]

    @pytest.mark.asyncio
    async def test_caps_huge_retry_after(self, monkeypatch):
        """Vendor says 600s — we cap at remaining budget."""
        sleeps: list[float] = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)

        monkeypatch.setattr('app.services.llm.retry.asyncio.sleep', fake_sleep)

        err = _make_rate_limit_error(retry_after=600)
        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=[err, 'ok'])
        await _invoke_with_retry(llm, [], 'TEST')
        # Should be capped at _MAX_BACKOFF_TOTAL_SECONDS, not 600
        assert sleeps[0] <= _MAX_BACKOFF_TOTAL_SECONDS
        assert sleeps[0] != 600

    @pytest.mark.asyncio
    async def test_retries_then_raises_when_attempts_exhausted(self, monkeypatch):
        """All attempts fail — bubble the last RateLimitError."""
        async def noop_sleep(_):
            pass

        monkeypatch.setattr('app.services.llm.retry.asyncio.sleep', noop_sleep)

        err = _make_rate_limit_error()
        err.retry_after = None  # type: ignore[attr-defined]

        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=err)
        with pytest.raises(RateLimitError):
            await _invoke_with_retry(llm, [], 'TEST')
        # Initial try + one retry per schedule entry
        assert llm.ainvoke.await_count == len(_RATE_LIMIT_BACKOFFS) + 1

    @pytest.mark.asyncio
    async def test_non_rate_limit_error_bubbles_immediately(self):
        """A 500 / generic exception must NOT be swallowed and retried."""
        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=RuntimeError('server boom'))
        with pytest.raises(RuntimeError):
            await _invoke_with_retry(llm, [], 'TEST')
        assert llm.ainvoke.await_count == 1

    @pytest.mark.asyncio
    async def test_output_parser_exception_bubbles_immediately(self):
        """Schema parse failures should not be retried."""
        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=OutputParserException('bad json'))
        with pytest.raises(OutputParserException):
            await _invoke_with_retry(llm, [], 'TEST')
        assert llm.ainvoke.await_count == 1

    @pytest.mark.asyncio
    async def test_network_error_retried_once(self, monkeypatch):
        sleeps: list[float] = []

        async def fake_sleep(seconds):
            sleeps.append(seconds)

        monkeypatch.setattr('app.services.llm.retry.asyncio.sleep', fake_sleep)

        # APIConnectionError needs a request arg
        err = APIConnectionError(request=MagicMock())
        llm = MagicMock()
        llm.ainvoke = AsyncMock(side_effect=[err, 'ok'])
        result = await _invoke_with_retry(llm, [], 'TEST')
        assert result == 'ok'
        assert llm.ainvoke.await_count == 2  # one initial + one retry
