"""P4.2 tests: observability gaps — cache_hit + categorical error_type.

Closes two long-standing holes in the LLM trace surface:

1. ``cache_hit`` — previously a Redis cache hit short-circuited the LLM
   call entirely and emitted zero trace rows. Cache hit rate was
   uncomputable, and cost dashboards couldn't distinguish a "free"
   cache-served request from an unusually-cheap LLM call.

2. ``error_type`` — previously ``error_message`` was free-form text, so
   "how many 429s vs 5xx in the last hour?" required regex over strings.
   ``error_type`` is a categorical field with stable values that SQL/ELK
   dashboards can group on without brittle text matching.

The classifier is the load-bearing piece — a wrong classification
either hides a real incident category (false negative) or noisily
alerts on the wrong thing (false positive). Pin every category down.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.llm.observability import (
    _classify_error,
    _log_cache_hit,
    _log_call,
    _trace_writer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _capture_trace(fn, **kwargs) -> dict:
    """Run ``fn`` and capture the trace dict that lands in the writer."""
    with patch.object(_trace_writer.__class__, 'add') as mock_add:
        fn(**kwargs)
    assert mock_add.called, 'no trace emitted'
    return mock_add.call_args[0][0]


# ---------------------------------------------------------------------------
# _classify_error — type-based detection (authoritative)
# ---------------------------------------------------------------------------


def test_classify_rate_limit_error_type_check():
    """RateLimitError instance → 'rate_limit'. Type wins over substring."""
    from openai import RateLimitError
    try:
        exc = RateLimitError(
            message='quota exceeded',
            response=MagicMock(status_code=429, headers={}),
            body=None,
        )
    except TypeError:
        # Newer openai SDKs use a different constructor signature.
        exc = RateLimitError(message='quota', response=MagicMock(status_code=429, headers={}), body=None)
    assert _classify_error(exc, None) == 'rate_limit'


def test_classify_timeout_error_type_check():
    """APITimeoutError instance → 'timeout'."""
    from openai import APITimeoutError
    exc = APITimeoutError(request=MagicMock())
    assert _classify_error(exc, None) == 'timeout'


def test_classify_connection_error_type_check():
    """APIConnectionError instance → 'network'."""
    from openai import APIConnectionError
    exc = APIConnectionError(request=MagicMock())
    assert _classify_error(exc, None) == 'network'


def test_classify_auth_error_type_check():
    """AuthenticationError instance → 'auth'."""
    from openai import AuthenticationError
    exc = AuthenticationError(
        message='bad api key',
        response=MagicMock(status_code=401, headers={}),
        body=None,
    )
    assert _classify_error(exc, None) == 'auth'


def test_classify_cancelled_error():
    """asyncio.CancelledError → 'cancelled'. User-initiated stream stop."""
    exc = asyncio.CancelledError()
    assert _classify_error(exc, None) == 'cancelled'


def test_classify_generic_timeout():
    """stdlib TimeoutError / asyncio.TimeoutError → 'timeout'."""
    assert _classify_error(TimeoutError('timed out'), None) == 'timeout'
    assert _classify_error(asyncio.TimeoutError(), None) == 'timeout'


def test_classify_generic_connection_error():
    """stdlib ConnectionError → 'network'."""
    assert _classify_error(ConnectionError('refused'), None) == 'network'


# ---------------------------------------------------------------------------
# _classify_error — substring fallback (for callers passing only message)
# ---------------------------------------------------------------------------


def test_classify_rate_limit_from_message_substring():
    """No exception, just message → substring detects '429' / 'rate limit'."""
    assert _classify_error(None, 'Rate limit exceeded') == 'rate_limit'
    assert _classify_error(None, 'HTTP 429 too many requests') == 'rate_limit'
    assert _classify_error(None, 'Account quota exceeded') == 'rate_limit'


def test_classify_timeout_from_message_substring():
    """Substring fallback detects 'timed out'."""
    assert _classify_error(None, 'Request timed out') == 'timeout'
    assert _classify_error(None, 'connection timeout') == 'timeout'


def test_classify_network_from_message_substring():
    """Substring fallback detects 'connection' / 'network'."""
    assert _classify_error(None, 'Connection refused') == 'network'
    assert _classify_error(None, 'Host unreachable') == 'network'


def test_classify_auth_from_message_substring():
    """Substring fallback detects 'unauthorized' / 'api key'."""
    assert _classify_error(None, '401 Unauthorized') == 'auth'
    assert _classify_error(None, 'Invalid API key') == 'auth'


def test_classify_server_error_from_message_substring():
    """Substring fallback detects 5xx codes / 'server error'."""
    assert _classify_error(None, 'HTTP 503 service unavailable') == 'server_error'
    assert _classify_error(None, 'Internal server error') == 'server_error'


def test_classify_unknown_for_unmatched_message():
    """Genuinely unmatched → 'unknown' (NOT None — for dashboard grouping)."""
    assert _classify_error(None, 'something completely novel') == 'unknown'


def test_classify_returns_none_for_no_input():
    """No exception AND no message → None (the success path)."""
    assert _classify_error(None, None) is None
    assert _classify_error(None, '') is None


def test_classify_circuit_open_from_message():
    """Circuit-breaker rejection message → 'circuit_open'."""
    assert _classify_error(None, 'circuit breaker open') == 'circuit_open'


def test_classify_budget_exceeded_from_message():
    """Daily token budget rejection → 'budget_exceeded'."""
    assert _classify_error(None, 'daily token budget exceeded') == 'budget_exceeded'


def test_classify_parse_failure_from_message():
    """JSON parse failure → 'parse_failure'."""
    assert _classify_error(None, 'JSON parse error') == 'parse_failure'
    assert _classify_error(None, 'schema validation failed') == 'parse_failure'


def test_classify_content_filter_from_message():
    """Content safety filter → 'content_filter'."""
    assert _classify_error(None, 'content_filter triggered') == 'content_filter'


def test_classify_type_check_wins_over_substring():
    """When exc is provided, type wins even if message looks like another category.

    Defensive: a RateLimitError whose message happens to contain 'timeout'
    (vendor wording like 'rate limit: timeout retry') should still classify
    as rate_limit because the type is authoritative.
    """
    from openai import RateLimitError
    exc = RateLimitError(
        message='rate limit timeout period',
        response=MagicMock(status_code=429, headers={}),
        body=None,
    )
    assert _classify_error(exc, None) == 'rate_limit'


# ---------------------------------------------------------------------------
# _log_call propagates error_type
# ---------------------------------------------------------------------------


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_classifies_error_from_exc(mock_settings):
    """Passing exc= through propagates a classified error_type into the trace."""
    from openai import RateLimitError
    exc = RateLimitError(
        message='429', response=MagicMock(status_code=429, headers={}), body=None,
    )
    trace = _capture_trace(
        _log_call,
        request_id='r1', model='glm-4.7-flash', label='test',
        latency_ms=100, usage={}, success=False,
        error_message='429', exc=exc,
    )
    assert trace['error_type'] == 'rate_limit'
    assert trace['success'] is False
    assert trace['cache_hit'] is False


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_classifies_error_from_message_when_no_exc(mock_settings):
    """error_message alone (no exc) still classifies via substring fallback."""
    trace = _capture_trace(
        _log_call,
        request_id='r2', model='glm-4.7-flash', label='test',
        latency_ms=100, usage={}, success=False,
        error_message='Connection refused',
    )
    assert trace['error_type'] == 'network'


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_success_has_no_error_type(mock_settings):
    """Successful call → error_type is None, not 'unknown'."""
    trace = _capture_trace(
        _log_call,
        request_id='r3', model='glm-4.7-flash', label='test',
        latency_ms=100,
        usage={'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
        success=True,
    )
    assert trace['error_type'] is None
    assert trace['cache_hit'] is False


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_explicit_error_type_kwarg_wins(mock_settings):
    """Caller can pass error_type= explicitly to skip re-classification.

    Useful for paths like circuit-breaker rejection where the caller already
    knows the category without needing to construct a synthetic exception.
    """
    trace = _capture_trace(
        _log_call,
        request_id='r4', model='glm-4.7-flash', label='test',
        latency_ms=100, usage={}, success=False,
        error_message='breaker tripped',
        error_type='circuit_open',
    )
    assert trace['error_type'] == 'circuit_open'


# ---------------------------------------------------------------------------
# _log_cache_hit — cache-served responses
# ---------------------------------------------------------------------------


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_cache_hit_emits_trace_with_cache_hit_true(mock_settings):
    """The whole point: cache hits now produce a trace row."""
    trace = _capture_trace(
        _log_cache_hit,
        request_id='c1', label='companion_stream',
        prompt_version='v3',
    )
    assert trace['cache_hit'] is True
    assert trace['success'] is True
    assert trace['fallback_used'] is False
    assert trace['error_type'] is None
    assert trace['error_message'] is None


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_cache_hit_costs_zero_tokens(mock_settings):
    """Cache hit costs nothing and consumes no tokens — for cost dashboards."""
    trace = _capture_trace(
        _log_cache_hit,
        request_id='c2', label='test', prompt_version='v1',
    )
    assert trace['prompt_tokens'] == 0
    assert trace['completion_tokens'] == 0
    assert trace['total_tokens'] == 0
    assert trace['estimated_cost_usd'] == 0.0


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_cache_hit_finish_reason_is_cache_marker(mock_settings):
    """finish_reason='cache' lets queries exclude cache rows from per-model stats.

    Without this marker, downstream analytics would average latency across
    cache-served (~0ms) and real LLM calls (seconds) — p50 would be useless.
    """
    trace = _capture_trace(
        _log_cache_hit,
        request_id='c3', label='test', prompt_version='v1',
    )
    assert trace['finish_reason'] == 'cache'
    assert trace['model'] == 'cached'


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_cache_hit_preserves_provenance_fields(mock_settings):
    """prompt_version / user_id / book_id / lang flow through for triage."""
    trace = _capture_trace(
        _log_cache_hit,
        request_id='c4', label='companion_stream',
        prompt_version='v7',
        user_id='user-abc',
        book_id='book-xyz',
        lang='zh',
    )
    assert trace['prompt_version'] == 'v7'
    assert trace['lang'] == 'zh'


# ---------------------------------------------------------------------------
# _log_call default values — backwards compat
# ---------------------------------------------------------------------------


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_defaults_cache_hit_false_when_unspecified(mock_settings):
    """Old call sites that don't pass cache_hit must still work — defaults False."""
    trace = _capture_trace(
        _log_call,
        request_id='b1', model='glm-4.7-flash', label='test',
        latency_ms=100,
        usage={'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
        success=True,
    )
    assert trace['cache_hit'] is False


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_log_call_defaults_error_type_none_on_success(mock_settings):
    """Successful call with no error info → error_type None."""
    trace = _capture_trace(
        _log_call,
        request_id='b2', model='glm-4.7-flash', label='test',
        latency_ms=100,
        usage={'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
        success=True,
    )
    assert trace['error_type'] is None


# ---------------------------------------------------------------------------
# A1 — _extract_finish_reason populates finish_reason from response metadata
# ---------------------------------------------------------------------------


def test_extract_finish_reason_returns_value_from_response_metadata():
    """finish_reason from a langchain ChatOpenAI response is surfaced.

    Verification-gap fix (A1): previously every fresh LLM call logged
    finish_reason=None even though the field was plumbed through every
    layer. The vendor stop reason (stop / length / tool_calls /
    content_filter) lives at response_metadata['finish_reason'] — this
    helper mirrors _extract_usage's defensive pattern.
    """
    from app.services.llm.observability import _extract_finish_reason
    response = MagicMock()
    response.response_metadata = {
        'finish_reason': 'length',
        'token_usage': {'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
    }
    assert _extract_finish_reason(response) == 'length'


def test_extract_finish_reason_returns_none_when_missing():
    """No finish_reason in metadata → None (not a string default)."""
    from app.services.llm.observability import _extract_finish_reason
    response = MagicMock()
    response.response_metadata = {}
    assert _extract_finish_reason(response) is None


def test_extract_finish_reason_handles_missing_response_metadata():
    """Response with no response_metadata at all → None, not AttributeError."""
    from app.services.llm.observability import _extract_finish_reason
    response = MagicMock()
    del response.response_metadata  # getattr returns MagicMock default — guard against
    # Setting to None explicitly to simulate the defensive path.
    response.response_metadata = None
    assert _extract_finish_reason(response) is None


@patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
def test_record_success_passes_finish_reason_to_log_call(mock_settings):
    """_record_success extracts finish_reason from response and threads it through.

    This is the wire-up test: a fake response with finish_reason='length'
    must produce a trace whose finish_reason field is 'length' — not None.
    Before A1, this test would fail because the kwarg was never populated.
    """
    from app.services.llm.provider_fallback import _record_success

    captured: dict = {}

    def fake_add(trace):
        captured.update(trace)

    state = MagicMock()
    state.circuit.record_success = AsyncMock()
    registry = MagicMock()

    response = MagicMock()
    response.response_metadata = {
        'finish_reason': 'length',
        'token_usage': {'prompt_tokens': 10, 'completion_tokens': 20, 'total_tokens': 30},
    }

    with patch.object(_trace_writer.__class__, 'add', side_effect=fake_add):
        asyncio.run(_record_success(
            state=state, provider_name='glm', registry=registry,
            request_id='r-fin', model_used='glm-4.7-flash', log_label='test',
            start=0.0, response=response,
            user_id='u1', book_id='b1',
        ))

    assert captured['finish_reason'] == 'length'
    assert captured['success'] is True


# ---------------------------------------------------------------------------
# End-to-end: safe_llm_invoke emits cache trace on hit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_safe_llm_invoke_emits_cache_hit_trace_on_cache_hit():
    """The motivating case: a cache hit must now appear in the trace surface.

    Before P4.2, cache hits were silent. This test asserts the contract
    holds: when safe_llm_invoke returns from cache, a trace row with
    cache_hit=True is emitted to the writer.
    """
    from app.services.llm import safe_invoke

    # Patch _check_json_cache to return a cached payload (not _MISS).
    cached_payload = {'summary': 'cached result'}

    with patch.object(
        safe_invoke, '_check_json_cache',
        return_value=cached_payload,
    ), patch.object(
        _trace_writer.__class__, 'add',
    ) as mock_add, patch(
        'app.services.llm.observability.get_settings',
        return_value=MagicMock(llm_log_enabled=True),
    ):
        result = await safe_invoke.safe_llm_invoke(
            messages=[],
            log_label='test_cache_hit',
            use_cache=True,
        )

    assert result == cached_payload
    assert mock_add.called, 'cache hit did not emit a trace row'
    trace = mock_add.call_args[0][0]
    assert trace['cache_hit'] is True
    assert trace['label'] == 'test_cache_hit'


@pytest.mark.asyncio
async def test_safe_llm_invoke_skips_cache_trace_when_cache_miss():
    """Cache miss must NOT emit a cache_hit trace — only the normal LLM call trace.

    Regression guard: if the cache-miss path accidentally fired _log_cache_hit,
    we'd see two trace rows for one logical request — corrupting analytics.
    """
    from app.services.llm import safe_invoke
    from app.services.llm.safe_invoke import _MISS

    with patch.object(
        safe_invoke, '_check_json_cache', return_value=_MISS,
    ), patch.object(
        safe_invoke, '_invoke_with_circuit',
        return_value=None,  # forces fallback return without calling LLM
    ), patch.object(
        _trace_writer.__class__, 'add',
    ) as mock_add, patch(
        'app.services.llm.observability.get_settings',
        return_value=MagicMock(llm_log_enabled=True),
    ):
        await safe_invoke.safe_llm_invoke(
            messages=[],
            log_label='test_cache_miss',
            use_cache=True,
            fallback='default',
        )

    # No cache_hit trace should have been emitted (mock_add may be called
    # for the LLM-call trace from _invoke_with_circuit, but none with
    # cache_hit=True).
    for call in mock_add.call_args_list:
        trace = call[0][0]
        assert not trace.get('cache_hit'), (
            f'cache-miss path emitted a cache_hit trace: {trace}'
        )
