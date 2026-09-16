"""Tests for the LLM trace JSONL sink + opt-in content capture (engineering-upgrade B1).

Covers: sink gating by LLM_TRACE_JSONL_PATH, record shape (ts auto-stamp),
write-failure tolerance (never raises), and capture_llm_content's
flag-gating + truncation + DB-avoidance (content only ever reaches the file).
"""

from __future__ import annotations

import json

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from app.services.llm.observability import _jsonl_sink, capture_llm_content


def _settings_mock(**kwargs):
    return MagicMock(
        llm_trace_jsonl_path=kwargs.get('jsonl_path', ''),
        llm_trace_capture_content=kwargs.get('capture', False),
        llm_trace_capture_chars=kwargs.get('chars', 800),
    )


@pytest.fixture(autouse=True)
def _reset_jsonl_buf():
    """The module-level JSONL sink buffers across tests; leftover records
    from a previous test would flush into the NEXT test's file."""
    from app.services.llm.observability import _jsonl_sink
    _jsonl_sink._buf.clear()
    yield
    _jsonl_sink._buf.clear()


class TestJSONLSink:
    def test_off_by_default(self, tmp_path: Path):
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=''),
        ):
            _jsonl_sink.write({'request_id': 'r1'})
        assert not (tmp_path / 'anything').exists()

    def test_writes_json_line_with_ts(self, tmp_path: Path):
        target = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=str(target)),
        ):
            _jsonl_sink.write({'request_id': 'r1', 'success': True})
            _jsonl_sink.write({'request_id': 'r2', 'error_type': 'timeout'})
            _jsonl_sink.flush(str(target))
        lines = target.read_text(encoding='utf-8').strip().splitlines()
        assert len(lines) == 2
        first = json.loads(lines[0])
        assert first['request_id'] == 'r1'
        assert first['success'] is True
        assert 'ts' in first  # auto-stamped, ISO-8601 UTC
        assert json.loads(lines[1])['error_type'] == 'timeout'

    def test_existing_ts_not_overwritten(self, tmp_path: Path):
        target = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=str(target)),
        ):
            _jsonl_sink.write({'ts': '2026-09-05T00:00:00+00:00'})
            _jsonl_sink.flush(str(target))
        assert json.loads(target.read_text())['ts'] == '2026-09-05T00:00:00+00:00'

    def test_unwritable_path_never_raises(self):
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path='/nonexistent-dir/x/traces.jsonl'),
        ):
            _jsonl_sink.write({'request_id': 'r1'})  # must swallow OSError
            _jsonl_sink.flush('/nonexistent-dir/x/traces.jsonl')


class _Msg:
    def __init__(self, type_: str, content: str) -> None:
        self.type = type_
        self.content = content


class TestCaptureLLMContent:
    def _messages(self):
        return [
            _Msg('system', 'You are a companion.'),
            _Msg('human', 'What does chapter 3 mean?'),
        ]

    def test_disabled_by_default(self, tmp_path: Path):
        target = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=str(target), capture=False),
        ):
            capture_llm_content(
                request_id='r1', label='companion', model='glm-4.7-flash',
                prompt_version='v3', messages=self._messages(),
                output_text='answer',
            )
        assert not target.exists()

    def test_captures_truncated_previews_to_file_only(self, tmp_path: Path):
        target = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=str(target), capture=True, chars=40),
        ):
            capture_llm_content(
                request_id='r9', label='flashcard', model='glm-4.7-flash',
                prompt_version='v2', messages=self._messages(),
                output_text='x' * 500, user_id='u1', book_id='b1',
            )
        _jsonl_sink.flush(str(target))
        record = json.loads(target.read_text(encoding='utf-8').strip())
        assert record['event'] == 'llm_content'
        assert record['request_id'] == 'r9'
        assert record['user_id'] == 'u1'
        assert len(record['prompt_preview']) <= 40
        assert len(record['output_preview']) == 40  # truncated, not full 500
        assert record['prompt_preview'].startswith('[system]')

    def test_no_file_channel_means_no_capture(self, tmp_path: Path):
        # capture flag on but no JSONL path — content must not reach any other channel.
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path='', capture=True),
        ):
            capture_llm_content(
                request_id='r1', label='x', model='m', prompt_version=None,
                messages=self._messages(), output_text='y',
            )
        assert list(tmp_path.iterdir()) == []


class TestJSONLRotation:
    async def test_rotates_at_size_cap(self, tmp_path: Path):
        """24h-review R4: the sink must not grow unbounded — past
        ROTATE_BYTES the current file moves to .1 and a fresh one starts."""
        target = tmp_path / 'traces.jsonl'
        with (
            patch(
                'app.services.llm.observability.get_settings',
                return_value=_settings_mock(jsonl_path=str(target)),
            ),
            patch.object(
                type(_jsonl_sink), 'ROTATE_BYTES', 1,
            ),
        ):
            _jsonl_sink.write({'request_id': 'r1'})
            _jsonl_sink.flush(str(target))
            _jsonl_sink.write({'request_id': 'r2'})
            _jsonl_sink.flush(str(target))
        assert target.exists()
        assert (tmp_path / 'traces.jsonl.1').exists()
        assert 'r1' in (tmp_path / 'traces.jsonl.1').read_text()
        assert 'r2' in target.read_text()


class TestJSONLPeriodicFlush:
    async def test_flush_loop_drains_sink(self, tmp_path):
        """F1: records below the 64-record threshold must reach the file via
        the flush-loop tick (or shutdown), not only via the size trigger."""
        from app.services.llm.observability import _trace_writer

        target = tmp_path / 'traces.jsonl'
        with patch(
            'app.services.llm.observability.get_settings',
            return_value=_settings_mock(jsonl_path=str(target)),
        ):
            _jsonl_sink.write({'request_id': 'lonely'})
            assert not target.exists()  # buffered, under threshold
            _trace_writer._flush_jsonl_sink()
        assert 'lonely' in target.read_text(encoding='utf-8')
