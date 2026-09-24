"""Tests for LLM call trace persistence."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from uuid import uuid4
from sqlalchemy.exc import DBAPIError

from app.services.llm import _TraceWriter, _log_call, _trace_writer


def _make_trace(**overrides) -> dict:
    base = {
        'request_id': 'abc123',
        'model': 'glm-4.7-flash',
        'label': 'test',
        'latency_ms': 100,
        'prompt_tokens': 10,
        'completion_tokens': 20,
        'total_tokens': 30,
        'estimated_cost_usd': 0.001,
        'success': True,
        'fallback_used': False,
        'error_message': None,
    }
    base.update(overrides)
    return base


def _mock_async_session():
    """Build a mock async context manager for async_session().

    ``execute`` returns a result whose ``.scalars().all()`` chain is
    synchronous and empty — the writer's rollup upsert SELECTs before
    merging (P-C), and a bare AsyncMock made that chain yield coroutines.
    """
    mock_session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    mock_session.execute = AsyncMock(return_value=result)
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_factory, mock_session


class TestTraceWriter:
    """Unit tests for the _TraceWriter buffered persistence."""

    # P4.4: ``_TraceWriter.add`` consults ``settings.llm_log_enabled`` before
    # appending — the gate moved inside the method so call sites don't have
    # to repeat it. Tests that exercise ``add`` directly must enable the
    # flag, otherwise the gate no-ops and the buffer stays empty.
    _ENABLED = patch(
        'app.services.llm.observability._writer.get_settings',
        return_value=MagicMock(llm_log_enabled=True),
    )

    @_ENABLED
    def test_add_accumulates_in_buffer(self, _mock_settings):
        writer = _TraceWriter()
        writer.add(_make_trace())
        assert len(writer._buf) == 1

    @_ENABLED
    @pytest.mark.asyncio
    async def test_flush_writes_to_db(self, _mock_settings):
        writer = _TraceWriter()
        writer.add(_make_trace())

        mock_factory, mock_session = _mock_async_session()
        with patch('app.db.async_session', mock_factory):
            count = await writer.flush()

        assert count == 1
        assert len(writer._buf) == 0
        mock_session.add_all.assert_called_once()
        mock_session.commit.assert_called_once()

    @_ENABLED
    @pytest.mark.asyncio
    async def test_flush_failure_does_not_raise(self, _mock_settings):
        writer = _TraceWriter()
        writer.add(_make_trace(success=False, error_message='err'))

        with patch('app.db.async_session', side_effect=DBAPIError('stmt', {}, Exception('DB down'))):
            count = await writer.flush()

        assert count == 0
        assert len(writer._buf) == 0

    @pytest.mark.asyncio
    async def test_flush_empty_buffer_is_noop(self):
        writer = _TraceWriter()
        with patch('app.db.async_session') as mock_sf:
            count = await writer.flush()
        assert count == 0
        mock_sf.assert_not_called()

    @_ENABLED
    @pytest.mark.asyncio
    async def test_flush_drains_only_batch_size(self, _mock_settings):
        writer = _TraceWriter()
        writer.MAX_BUFFER = 3
        for i in range(5):
            writer.add(_make_trace(request_id=f'test{i:03d}', latency_ms=i))

        mock_factory, mock_session = _mock_async_session()
        with patch('app.db.async_session', mock_factory):
            count = await writer.flush()

        assert count == 3
        assert len(writer._buf) == 2

    @patch(
        'app.services.llm.observability._writer.get_settings',
        return_value=MagicMock(llm_log_enabled=False),
    )
    def test_add_skipped_when_feature_disabled(self, _mock_settings):
        """P4.4: ``add`` must short-circuit when ``llm_log_enabled`` is off.

        Guards against drift if someone removes the gate at the call sites
        (which used to be the only place it was checked).
        """
        writer = _TraceWriter()
        writer.add(_make_trace())
        assert writer._buf == []


class TestLogCallIntegration:
    """Test that _log_call triggers trace persistence."""

    @patch('app.services.llm.observability._jsonl.get_settings', return_value=MagicMock(llm_log_enabled=True))
    def test_log_call_appends_to_trace_writer(self, mock_settings):
        with patch.object(_trace_writer.__class__, 'add') as mock_add:
            _log_call(
                request_id='abc123def456',
                model='deepseek-chat',
                label='Companion_stream',
                latency_ms=250,
                usage={'prompt_tokens': 100, 'completion_tokens': 200, 'total_tokens': 300},
                success=True,
            )
            mock_add.assert_called_once()
            trace = mock_add.call_args[0][0]
            assert trace['request_id'] == 'abc123def456'
            assert trace['model'] == 'deepseek-chat'
            assert trace['success'] is True
            assert trace['prompt_tokens'] == 100
            assert trace['estimated_cost_usd'] > 0

    @patch('app.services.llm.observability._jsonl.get_settings', return_value=MagicMock(llm_log_enabled=True))
    def test_log_call_with_error(self, mock_settings):
        with patch.object(_trace_writer.__class__, 'add') as mock_add:
            _log_call(
                request_id='err0001',
                model='glm-4-flash',
                label='Reading Mirror section encounter',
                latency_ms=5000,
                usage={},
                success=False,
                error_message='Connection timeout',
            )
            trace = mock_add.call_args[0][0]
            assert trace['success'] is False
            assert trace['error_message'] == 'Connection timeout'


class TestStreamingTraceMirror:
    """2026-09-15 monitoring close-out: streaming completions must reach
    llm_call_traces (they're the bulk of LLM traffic; metrics were blind)."""

    @pytest.mark.asyncio
    async def test_persist_stream_log_writes_trace(self):
        from unittest.mock import patch
        from app.services.companion.safety import persist_stream_log
        from app.services.llm.observability import _trace_writer

        _trace_writer._buf.clear()
        with patch('app.services.llm.observability._writer.get_settings') as ms:
            ms.return_value.llm_log_enabled = True
            persist_stream_log(
                request_id='req123456789',
                model='mimo-v2.5', latency_ms=12345, success=True,
                ttft_ms=5432, user_id=uuid4(), book_id=uuid4(),
            )
        assert len(_trace_writer._buf) == 1
        rec = _trace_writer._buf[0]
        assert rec['label'] == 'companion.stream'
        assert rec['ttft_ms'] == 5432 and rec['latency_ms'] == 12345
        # P-D follow-up: the direct-writer path must fill http_request_id
        # from the same contextvar _log_call reads — NULL here made every
        # streaming span unchainable in the traces UI (and its captured
        # content unreachable, since the I/O panel lives in the chain).
        import structlog
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id='http-abc-123')
        _trace_writer._buf.clear()
        with patch('app.services.llm.observability._writer.get_settings') as ms:
            ms.return_value.llm_log_enabled = True
            persist_stream_log(
                request_id='req123456789',
                model='mimo-v2.5', latency_ms=12345, success=True,
                ttft_ms=5432, user_id=uuid4(), book_id=uuid4(),
            )
        rec2 = _trace_writer._buf[0]
        assert rec2['http_request_id'] == 'http-abc-123'
        structlog.contextvars.clear_contextvars()
        _trace_writer._buf.clear()
