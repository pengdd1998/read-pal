"""P-D raw content capture: fan-out gating, writer, prune, API (2026-09-24).

Covers the llm_trace_contents channel end to end:
- ``capture_llm_content`` fan-out: JSONL and DB channels gate independently,
  truncation flags, request_id clamping.
- ``_TraceWriter.add_content`` / ``flush_contents``: gating, SQLite dialect
  insert, duplicate request_id silently dropped (ON CONFLICT DO NOTHING).
- Content prune rides the trace prune cadence with its own horizon.
- Router: ops-key gate, 404 capture_disabled vs not_found, 200 payload shape
  (no raw user_id).
- Streaming settlement hook: successful turn captures label/model/messages/
  joined raw output exactly once.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, UTC
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.llm_trace_content import LLMTraceContent
from app.services.llm.observability import capture_llm_content
from tests.conftest import _TestSession, auth_headers, register_user

OPS_KEY = 'test-ops-key-zj'


def _msg(content: str, type_: str = 'human') -> MagicMock:
    m = MagicMock()
    m.content = content
    m.type = type_
    return m


@pytest.fixture(autouse=True)
def _reset_content_buf():
    """The writer buffers module-globally; leftover rows would leak across
    tests (same discipline as the JSONL sink buffer fixture)."""
    from app.services.llm.observability import _trace_writer
    _trace_writer._content_buf.clear()
    yield
    _trace_writer._content_buf.clear()


class _CaptureSettings(MagicMock):
    pass


def _settings(
    *, capture_jsonl: bool = False, content_db: bool = False,
    content_chars: int = 20000,
) -> MagicMock:
    s = MagicMock()
    s.llm_trace_capture_content = capture_jsonl
    s.llm_trace_capture_chars = 800
    # The sink independently drops records when the path is unset — mirror
    # a live JSONL deployment whenever the channel is under test.
    s.llm_trace_jsonl_path = '/tmp/test-llm-content.jsonl' if capture_jsonl else ''
    s.llm_trace_content_db = content_db
    s.llm_trace_content_chars = content_chars
    return s


class TestCaptureFanout:
    def test_both_channels_off_buffers_nothing(self):
        from app.services.llm.observability import _jsonl_sink, _trace_writer
        _jsonl_sink._buf.clear()
        with patch(
            'app.services.llm.observability._jsonl.get_settings',
            return_value=_settings(),
        ):
            capture_llm_content(
                request_id='abcdef123456', label='flashcard.generate',
                model='glm-4.7-flash', prompt_version='v1',
                messages=[_msg('hi')], output_text='ok',
            )
        assert _trace_writer._content_buf == []
        assert _jsonl_sink._buf == []

    def test_db_channel_buffers_row_with_truncation_flags(self):
        from app.services.llm.observability import _jsonl_sink, _trace_writer
        _jsonl_sink._buf.clear()
        long_prompt = 'p' * 30
        long_output = 'o' * 30
        st = _settings(content_db=True, content_chars=10)
        with (
            patch('app.services.llm.observability._jsonl.get_settings', return_value=st),
            patch('app.services.llm.observability._writer.get_settings', return_value=st),
        ):
            capture_llm_content(
                request_id='abcdef1234567890abcd', label='companion.stream',
                model='glm-4.7-flash', prompt_version=None,
                messages=[_msg(long_prompt)], output_text=long_output,
                user_id='u-1', book_id='b-1',
            )
        assert len(_trace_writer._content_buf) == 1
        row = _trace_writer._content_buf[0]
        assert row['request_id'] == 'abcdef123456'  # clamped to 12
        assert row['label'] == 'companion.stream'
        assert row['prompt_text'] == '[human] ' + 'p' * 2  # 10-char cap incl. the [type] prefix
        assert row['output_text'] == 'o' * 10
        assert row['prompt_truncated'] is True
        assert row['output_truncated'] is True
        assert row['user_id'] == 'u-1'
        # JSONL channel stays off independently
        assert _jsonl_sink._buf == []

    def test_channels_gate_independently(self):
        from app.services.llm.observability import _jsonl_sink, _trace_writer
        _jsonl_sink._buf.clear()
        st = _settings(capture_jsonl=True)
        with (
            patch('app.services.llm.observability._jsonl.get_settings', return_value=st),
            patch('app.services.llm.observability._writer.get_settings', return_value=st),
        ):
            capture_llm_content(
                request_id='abcdef123456', label='l', model='m',
                prompt_version=None, messages=[_msg('x')], output_text='y',
            )
        assert _jsonl_sink._buf, 'jsonl channel on'
        assert _trace_writer._content_buf == [], 'db channel off'


class TestContentWriter:
    async def test_flush_inserts_and_fallback_chain_coexists(self):
        """0034: same request_id, different models → both rows persist."""
        from app.services.llm.observability import _trace_writer
        primary = {
            'request_id': 'chain00000001', 'http_request_id': 'http-1',
            'label': 'l', 'model': 'glm-4.7-flash', 'prompt_version': None,
            'prompt_text': 'p', 'output_text': None,  # failed: no output
            'prompt_truncated': False, 'output_truncated': False,
            'user_id': None, 'book_id': None,
        }
        fallback = {
            'request_id': 'chain00000001', 'http_request_id': 'http-1',
            'label': 'l', 'model': 'mimo-v2.5', 'prompt_version': None,
            'prompt_text': 'p', 'output_text': 'actual reply',
            'prompt_truncated': False, 'output_truncated': False,
            'user_id': None, 'book_id': None,
        }
        with (
            patch('app.services.llm.observability._writer.get_settings',
                  return_value=_settings(content_db=True)),
            patch('app.db.async_session', _TestSession),
        ):
            _trace_writer.add_content(primary)
            _trace_writer.add_content(fallback)
            _trace_writer.add_content(dict(fallback))  # exact dup — deduped
            written = await _trace_writer.flush_contents()
        assert written == 2  # two distinct (request_id, model) pairs
        async with _TestSession() as session:
            from sqlalchemy import select
            rows = (await session.execute(
                select(LLMTraceContent),
            )).scalars().all()
            assert len(rows) == 2
            models = {r.model for r in rows}
            assert models == {'glm-4.7-flash', 'mimo-v2.5'}
            # The successful fallback's output survives
            fb = next(r for r in rows if r.model == 'mimo-v2.5')
            assert fb.output_text == 'actual reply'

    async def test_prune_deletes_expired_content_rows(self):
        from app.services.llm.observability import _trace_writer
        from sqlalchemy import delete, select

        async with _TestSession() as session:
            old = LLMTraceContent(
                request_id='old000000001', label='l', model='m',
                prompt_text='x', output_text='y',
                created_at=datetime.now(UTC) - timedelta(days=30),
            )
            fresh = LLMTraceContent(
                request_id='new000000001', label='l', model='m',
                prompt_text='x', output_text='y',
                created_at=datetime.now(UTC),
            )
            session.add_all([old, fresh])
            await session.commit()

        settings = _settings(content_db=True)
        settings.llm_log_enabled = True
        settings.llm_log_retention_days = 90
        settings.llm_trace_content_retention_days = 7
        # Portable across monotonic origins (fresh CI runners have small
        # monotonic() values — 0.0 would fail the interval check there).
        _trace_writer._last_prune_monotonic = (
            time.monotonic() - _trace_writer.PRUNE_CHECK_INTERVAL - 1
        )
        with patch(
            'app.services.llm.observability._writer.get_settings',
            return_value=settings,
        ):
            await _trace_writer._maybe_prune(_TestSession)

        async with _TestSession() as session:
            remaining = (await session.execute(
                select(LLMTraceContent),
            )).scalars().all()
            assert [r.request_id for r in remaining] == ['new000000001']
            await session.execute(delete(LLMTraceContent))
            await session.commit()


class TestContentRouter:
    @pytest.fixture
    def ops_env(self, monkeypatch):
        monkeypatch.setenv('OPS_KEY', OPS_KEY)

    @pytest.mark.asyncio
    async def test_requires_ops_key(self, client, ops_env):
        reg = await register_user(client)
        resp = await client.get(
            '/api/v1/stats/llm/requests/abc123/content',
            headers=auth_headers(reg['token']),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_capture_disabled_404(self, client, ops_env, monkeypatch):
        monkeypatch.delenv('LLM_TRACE_CONTENT_DB', raising=False)
        reg = await register_user(client)
        resp = await client.get(
            '/api/v1/stats/llm/requests/abc123/content',
            headers={**auth_headers(reg['token']), 'X-Ops-Key': OPS_KEY},
        )
        assert resp.status_code == 404
        assert resp.json()['detail']['reason'] == 'capture_disabled'

    @pytest.mark.asyncio
    async def test_row_roundtrip_and_not_found(
        self, client, ops_env, monkeypatch,
    ):
        async with _TestSession() as session:
            session.add(LLMTraceContent(
                request_id='hit000000001', http_request_id='http-9',
                label='companion.stream', model='glm-4.7-flash',
                prompt_text='[system] …', output_text='answer',
                prompt_truncated=True, output_truncated=False,
                user_id='secret-user', book_id=None,
                created_at=datetime.now(UTC),
            ))
            await session.commit()

        # Router reads the flag via app.config.get_settings — pin it on.
        fake = _settings(content_db=True)
        with patch('app.config.get_settings', return_value=fake):
            reg = await register_user(client)
            headers = {**auth_headers(reg['token']), 'X-Ops-Key': OPS_KEY}

            ok = await client.get(
                '/api/v1/stats/llm/requests/hit000000001/content', headers=headers,
            )
            assert ok.status_code == 200
            data = ok.json()['data']
            assert data['prompt_text'].startswith('[system]')
            assert data['output_text'] == 'answer'
            assert data['prompt_truncated'] is True
            assert 'user_id' not in data  # never leaves raw

            missing = await client.get(
                '/api/v1/stats/llm/requests/nope000000001/content', headers=headers,
            )
            assert missing.status_code == 404
            assert missing.json()['detail']['reason'] == 'not_found'


class TestStreamingSettlementHook:
    """Successful turn → exactly one capture call with the joined raw output."""

    @pytest.mark.asyncio
    async def test_success_captures_once(self, monkeypatch):
        from app.services.companion import streaming

        budget = MagicMock()
        budget.check_and_charge_tokens = AsyncMock(return_value=(True, 0, 0))
        budget.settle_tokens = AsyncMock()
        settings = MagicMock()
        settings.llm_daily_token_budget = 0
        settings.llm_trace_capture_content = False
        settings.llm_trace_content_db = False

        state = MagicMock()
        state.circuit.allow_request = AsyncMock(return_value=True)
        registry = MagicMock()
        registry.get_provider = MagicMock(return_value=state)

        async def fake_provider_stream(
            state, provider_name, model_used, messages,
            collected_parts, request_id, start_time,
            user_id, book_id, lang, cancelled=None, billing_state=None, **kw,
        ):
            collected_parts.append('raw-part-1 ')
            collected_parts.append('raw-part-2')
            yield 'data: {"content": "x"}\n\n'

        async def fake_persist(*a, **kw):
            return uuid4()

        monkeypatch.setattr(
            streaming, '_get_stream_provider',
            lambda r, rid: (state, 'glm', 'glm-4.7-flash'),
        )
        monkeypatch.setattr(streaming, '_stream_from_provider', fake_provider_stream)
        monkeypatch.setattr(streaming, '_persist_with_retry', fake_persist)
        monkeypatch.setattr(streaming, 'get_registry', lambda: registry)
        monkeypatch.setattr('app.config.get_settings', lambda: settings)
        monkeypatch.setattr(
            'app.middleware.daily_llm_budget._get_budget', lambda: budget,
        )

        captured = []
        monkeypatch.setattr(
            'app.services.llm.observability.capture_llm_content',
            lambda **kw: captured.append(kw),
        )

        chunks = []
        async for chunk in streaming._stream_via_provider(
            AsyncMock(), uuid4(), uuid4(), 'hello',
            [_msg('hello')], 'en',
        ):
            chunks.append(chunk)

        assert captured, 'settlement hook must fire on success'
        assert len(captured) == 1
        call = captured[0]
        assert call['label'] == 'companion.stream'
        assert call['model'] == 'glm-4.7-flash'
        assert call['output_text'] == 'raw-part-1 raw-part-2'
        assert call['messages'] is not None
