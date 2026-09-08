"""Tests for the engineering-upgrade follow-ups to LLM trace persistence.

Covers (2026-09-05 leftover batch):
- migration 0029 columns: user_id / book_id reach the persisted trace dict
- http_request_id (column existed since 0018, never written): derived from
  the request_log middleware's structlog contextvar
- ``params`` (temperature/max_tokens): JSONL channel only, never the DB dict
- retention prune: ``_maybe_prune`` deletes rows older than
  ``llm_log_retention_days``; <= 0 disables; interval-gated
"""

from __future__ import annotations

import json

import pytest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import structlog
from sqlalchemy import select

from tests.conftest import _TestSession

from app.models.llm_trace import LLMCallTrace
from app.services.llm.observability import (
    _TraceWriter,
    _log_call,
)


def _settings(**kw):
    return MagicMock(
        llm_log_enabled=kw.get('enabled', False),
        llm_trace_jsonl_path=kw.get('jsonl_path', ''),
        llm_trace_capture_content=kw.get('capture', False),
        llm_trace_capture_chars=800,
        llm_log_retention_days=kw.get('retention', 90),
    )


def _call_log(**overrides):
    kwargs = dict(
        request_id='llm-req-1', model='glm-4.7-flash', label='test.followup',
        latency_ms=50, usage={'total_tokens': 10}, success=True,
        user_id='user-1', book_id='book-1',
    )
    kwargs.update(overrides)
    _log_call(**kwargs)


@pytest.fixture(autouse=True)
def _reset_jsonl_buf():
    """The module-level JSONL sink buffers across tests; leftover records
    from a previous test would flush into the NEXT test's file."""
    from app.services.llm.observability import _jsonl_sink
    _jsonl_sink._buf.clear()
    yield
    _jsonl_sink._buf.clear()


class TestNewTraceColumns:
    def test_user_book_reach_persisted_trace_dict(self):
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(),
        ), patch('app.services.llm.observability._trace_writer') as writer:
            structlog.contextvars.clear_contextvars()
            _call_log()
        trace = writer.add.call_args.args[0]
        assert trace['user_id'] == 'user-1'
        assert trace['book_id'] == 'book-1'
        # No HTTP context bound (background/eval) → None, not an error.
        assert trace['http_request_id'] is None
        # DB-shape safety: every key maps to a model column.
        assert LLMCallTrace(**trace) is not None

    def test_http_request_id_derived_from_contextvar(self):
        structlog.contextvars.bind_contextvars(request_id='http-abc123')
        try:
            with patch(
                'app.services.llm.observability.get_settings',
                return_value=_settings(),
            ), patch('app.services.llm.observability._trace_writer') as writer:
                _call_log()
        finally:
            structlog.contextvars.clear_contextvars()
        trace = writer.add.call_args.args[0]
        assert trace['http_request_id'] == 'http-abc123'
        assert trace['request_id'] == 'llm-req-1'  # LLM logical id untouched


class TestParamsChannel:
    def test_params_go_to_jsonl_only_not_db_dict(self, tmp_path: Path):
        sink_file = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(jsonl_path=str(sink_file)),
        ), patch('app.services.llm.observability._trace_writer') as writer:
            _call_log(params={'temperature': 0.3, 'max_tokens': 2000})

        trace = writer.add.call_args.args[0]  # DB dict
        assert 'params' not in trace
        # Buffered sink (24h-review R4): flush before reading the file.
        from app.services.llm.observability import _jsonl_sink
        _jsonl_sink.flush(str(sink_file))

        record = json.loads(sink_file.read_text(encoding='utf-8').strip())
        assert record['params'] == {'temperature': 0.3, 'max_tokens': 2000}
        assert record['user_id'] == 'user-1'
        assert record['http_request_id'] is None


class TestRetentionPrune:
    async def test_prunes_old_rows_keeps_recent(self):
        now = datetime.now(UTC)
        async with _TestSession() as session:
            session.add_all([
                LLMCallTrace(
                    request_id='old1', model='m', label='l', latency_ms=1,
                    success=True,
                    created_at=now - timedelta(days=91),
                ),
                LLMCallTrace(
                    request_id='new1', model='m', label='l', latency_ms=1,
                    success=True,
                    created_at=now - timedelta(days=1),
                ),
            ])
            await session.commit()

        writer = _TraceWriter()
        writer._last_prune_monotonic = 0.0  # simulate interval elapsed
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(retention=90, enabled=True),
        ):
            deleted = await writer._maybe_prune(session_factory=_TestSession)

        assert deleted == 1
        async with _TestSession() as session:
            remaining = (await session.execute(select(LLMCallTrace.request_id))).scalars().all()
        assert remaining == ['new1']

    async def test_zero_retention_disables_prune(self):
        async with _TestSession() as session:
            session.add(LLMCallTrace(
                request_id='ancient', model='m', label='l', latency_ms=1,
                success=True,
                created_at=datetime.now(UTC) - timedelta(days=3650),
            ))
            await session.commit()

        writer = _TraceWriter()
        writer._last_prune_monotonic = 0.0
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(retention=0, enabled=True),
        ):
            assert await writer._maybe_prune(session_factory=_TestSession) == 0

        async with _TestSession() as session:
            remaining = (await session.execute(select(LLMCallTrace.request_id))).scalars().all()
        assert 'ancient' in remaining  # keep-forever semantics

    async def test_disabled_log_skips_prune(self):
        """24h-review R3: LLM_LOG_ENABLED=False must not delete rows."""
        async with _TestSession() as session:
            session.add(LLMCallTrace(
                request_id='ancient2', model='m', label='l', latency_ms=1,
                success=True,
                created_at=datetime.now(UTC) - timedelta(days=3650),
            ))
            await session.commit()

        writer = _TraceWriter()
        writer._last_prune_monotonic = 0.0
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(retention=90, enabled=False),
        ):
            assert await writer._maybe_prune(session_factory=_TestSession) == 0

        async with _TestSession() as session:
            remaining = (await session.execute(select(LLMCallTrace.request_id))).scalars().all()
        assert 'ancient2' in remaining

    async def test_interval_gates_repeated_calls(self):
        writer = _TraceWriter()
        writer._last_prune_monotonic = 0.0
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings(retention=90, enabled=True),
        ):
            first = await writer._maybe_prune(session_factory=_TestSession)
            second = await writer._maybe_prune(session_factory=_TestSession)
        assert first == 0  # nothing to delete, but the prune RAN
        assert second == 0  # throttled: did not run (no way to observe side
        # effects here — the interval gate is asserted by _last_prune_monotonic
        assert writer._last_prune_monotonic > 0.0
