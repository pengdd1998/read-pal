"""Tests for LLM call trace persistence."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

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
    """Build a mock async context manager for async_session()."""
    mock_session = AsyncMock()
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
    mock_factory.return_value.__aexit__ = AsyncMock(return_value=False)
    return mock_factory, mock_session


class TestTraceWriter:
    """Unit tests for the _TraceWriter buffered persistence."""

    def test_add_accumulates_in_buffer(self):
        writer = _TraceWriter()
        writer.add(_make_trace())
        assert len(writer._buf) == 1

    @pytest.mark.asyncio
    async def test_flush_writes_to_db(self):
        writer = _TraceWriter()
        writer.add(_make_trace())

        mock_factory, mock_session = _mock_async_session()
        with patch('app.db.async_session', mock_factory):
            count = await writer.flush()

        assert count == 1
        assert len(writer._buf) == 0
        mock_session.add_all.assert_called_once()
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_flush_failure_does_not_raise(self):
        writer = _TraceWriter()
        writer.add(_make_trace(success=False, error_message='err'))

        with patch('app.db.async_session', side_effect=Exception('DB down')):
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

    @pytest.mark.asyncio
    async def test_flush_drains_only_batch_size(self):
        writer = _TraceWriter()
        writer.MAX_BUFFER = 3
        for i in range(5):
            writer.add(_make_trace(request_id=f'test{i:03d}', latency_ms=i))

        mock_factory, mock_session = _mock_async_session()
        with patch('app.db.async_session', mock_factory):
            count = await writer.flush()

        assert count == 3
        assert len(writer._buf) == 2


class TestLogCallIntegration:
    """Test that _log_call triggers trace persistence."""

    @patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
    def test_log_call_appends_to_trace_writer(self, mock_settings):
        with patch.object(_trace_writer.__class__, 'add') as mock_add:
            _log_call(
                request_id='abc123def456',
                model='glm-4.7-flash',
                label='Companion_stream',
                latency_ms=250,
                usage={'prompt_tokens': 100, 'completion_tokens': 200, 'total_tokens': 300},
                success=True,
            )
            mock_add.assert_called_once()
            trace = mock_add.call_args[0][0]
            assert trace['request_id'] == 'abc123def456'
            assert trace['model'] == 'glm-4.7-flash'
            assert trace['success'] is True
            assert trace['prompt_tokens'] == 100
            assert trace['estimated_cost_usd'] > 0

    @patch('app.services.llm.observability.get_settings', return_value=MagicMock(llm_log_enabled=True))
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
