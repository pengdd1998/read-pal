"""Critical path of a companion turn (P9.3 / P9.4) and the GB-11 mechanism.

Measured in production before these changes: the SSE response only opened
after query expansion + tool planning (15s), a Chinese question got an
English failure message, and a rerank vendor returning 402 was re-called on
every retrieval.
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import httpx
import pytest

from app.services.companion import context_enrichment, streaming
from app.services.rag import rerank
from app.utils.token_budget import TokenBudget

_UID, _BID = UUID(int=1), UUID(int=2)
_ZH_QUESTION = '这本书的主题是什么？'


async def _no_cache(*args, **kwargs):
    if False:  # pragma: no cover — an empty async generator
        yield


class TestRequestIdFrameFirst:
    @pytest.mark.asyncio
    async def test_the_id_frame_leaves_before_any_context_or_tool_work(self):
        order = []

        async def prepare(*args, **kwargs):
            order.append('prepare')
            return SimpleNamespace(title='T', author='A', progress=0, status='reading'), [], 'SYS', TokenBudget(model='glm-4-flash')

        async def tool_phase(**kwargs):
            order.append('tools')
            return kwargs['system_text'], [], []

        async def via_provider(*args, **kwargs):
            order.append('stream')
            yield 'data: {"content": "hi"}\n\n'

        with patch.object(streaming, '_prepare_context', prepare), \
             patch('app.services.companion.tools.phase.run_tool_phase', tool_phase), \
             patch.object(streaming, 'try_emit_cached', _no_cache), \
             patch.object(streaming, '_stream_via_provider', via_provider), \
             patch.object(streaming, '_build_messages', MagicMock(return_value=[])):
            gen = streaming.stream_chat(None, _UID, _BID, _ZH_QUESTION, request_id='req-first')
            first = await gen.__anext__()

            assert json.loads(first[len('data: '):-2]) == {'request_id': 'req-first'}
            assert order == [], 'nothing may run before the client can cancel'
            rest = [chunk async for chunk in gen]

        assert order == ['prepare', 'tools', 'stream']
        assert all('req-first' not in chunk for chunk in rest), 'the id frame is not repeated'

    @pytest.mark.asyncio
    async def test_direct_callers_of_the_provider_stage_still_get_the_frame(self):
        with patch.object(streaming, '_get_stream_provider', lambda r, rid: None), \
             patch.object(streaming, '_persist_with_retry', new=AsyncMock(return_value=UUID(int=9))):
            chunks = [c async for c in streaming._stream_via_provider(
                None, _UID, _BID, _ZH_QUESTION, [], 'en', request_id='req-direct',
            )]
        assert json.loads(chunks[0][len('data: '):-2]) == {'request_id': 'req-direct'}


class TestCannedTextFollowsTheMessageLanguage:
    async def _chunks(self, message, lang):
        with patch.object(streaming, '_get_stream_provider', lambda r, rid: None), \
             patch.object(streaming, '_persist_with_retry', new=AsyncMock(return_value=UUID(int=9))):
            return [c async for c in streaming._stream_via_provider(
                None, _UID, _BID, message, [], lang,
            )]

    async def _text(self, message):
        # SSE frames are JSON with \\u escapes — compare the decoded content.
        return ''.join(json.loads(c[len('data: '):-2])['content']
                       for c in await self._chunks(message, 'en') if '"content"' in c)

    @pytest.mark.asyncio
    async def test_a_chinese_question_never_meets_an_english_error(self):
        """The account language is 'en' here; the message is what the reader reads."""
        text = await self._text(_ZH_QUESTION)
        assert 'AI 服务暂时无法连接' in text
        assert 'trouble connecting' not in text

    @pytest.mark.asyncio
    async def test_an_english_question_keeps_the_english_text(self):
        text = await self._text('What is this about?')
        assert "I'm having trouble connecting" in text


class TestQueryExpansionIsBounded:
    def _fetch(self, enabled, expansion):
        settings = SimpleNamespace(rag_query_expansion_enabled=enabled)
        context = AsyncMock(return_value='CTX')
        with patch('app.config.get_settings', return_value=settings), \
             patch('app.services.rag.get_book_context', context), \
             patch('app.services.rag.query_expansion.expand_rag_query', expansion):
            text = asyncio.run(context_enrichment.fetch_rag(
                None, _UID, _BID, _ZH_QUESTION, [], 'content',
            ))
        return text, context.call_args.args[3]

    def test_off_by_default_no_model_call_on_the_critical_path(self):
        expansion = AsyncMock(return_value='关键词')
        assert self._fetch(False, expansion) == ('CTX', _ZH_QUESTION)
        assert expansion.await_count == 0

    def test_when_enabled_the_expanded_keywords_drive_retrieval(self):
        assert self._fetch(True, AsyncMock(return_value='关键词 扩展')) == ('CTX', '关键词 扩展')

    def test_a_slow_expansion_falls_back_to_the_raw_query(self):
        async def slow(query):
            await asyncio.sleep(5)
            return 'never'

        with patch.object(context_enrichment, 'EXPANSION_BUDGET_S', 0.05):
            assert self._fetch(True, slow) == ('CTX', _ZH_QUESTION)

    def test_default_is_off_in_the_shipped_settings(self):
        from app.config import Settings
        assert Settings.model_fields['rag_query_expansion_enabled'].default is False


class TestAuxiliaryCallsUseTheFastTier:
    @pytest.mark.asyncio
    async def test_tool_planner(self):
        from app.prompts.tool_plan import ToolPlanResult
        from app.services.companion.tools.planner import plan_tool_calls
        invoke = AsyncMock(return_value=ToolPlanResult().model_dump())
        with patch('app.services.llm.safe_llm_invoke', invoke):
            await plan_tool_calls(
                user_id=_UID, book_id=_BID, message=_ZH_QUESTION, book_title='T',
                book_author='A', progress=0, status='reading', has_rag=True,
                has_annotations=False,
            )
        assert invoke.await_args.kwargs['tier'] == 'fast'

    @pytest.mark.asyncio
    async def test_faithfulness_check(self):
        from app.services.companion.faithfulness import check_faithfulness
        call = AsyncMock(return_value='[0]')
        settings = SimpleNamespace(faithfulness_check_enabled=True)
        with patch('app.config.get_settings', return_value=settings), \
             patch('app.services.llm.safe_invoke.safe_llm_call', call):
            result = await check_faithfulness(
                '编造的一句话。原文里有的句子。',
                [SimpleNamespace(content='<book_passages>\n' + '原文内容。' * 20 + '\n</book_passages>')],
            )
        # tier must ride on the LLM call itself — once it landed on the
        # surrounding wait_for, which made every check fail silently.
        assert result == [0]
        assert call.await_args.kwargs['tier'] == 'fast'


class TestRerankVendorCooldown:
    @pytest.fixture(autouse=True)
    def _reset(self):
        rerank._cooldown['until'] = 0.0
        yield
        rerank._cooldown['until'] = 0.0

    @pytest.fixture
    def vendor(self):
        client = SimpleNamespace(post=AsyncMock())
        settings = SimpleNamespace(rerank_api_key='k', rerank_base_url='https://vendor.test/v1',
                                   rerank_model='m')
        with patch('app.config.get_settings', return_value=settings), \
             patch.object(rerank, '_get_http_client', return_value=client):
            yield client

    @staticmethod
    def _answers(client, status, **body):
        client.post.return_value = httpx.Response(
            status, request=httpx.Request('POST', 'https://vendor.test/rerank'), **body,
        )

    @pytest.mark.asyncio
    async def test_an_unpaid_vendor_is_called_once_then_left_alone(self, vendor):
        self._answers(vendor, 402)
        for _ in range(3):
            assert await rerank.rerank_passages('q', ['a', 'b']) is None
        assert vendor.post.await_count == 1

    @pytest.mark.asyncio
    async def test_a_transient_error_does_not_pause_rerank(self, vendor):
        self._answers(vendor, 503)
        assert await rerank.rerank_passages('q', ['a']) is None
        assert await rerank.rerank_passages('q', ['a']) is None
        assert vendor.post.await_count == 2

    @pytest.mark.asyncio
    async def test_rerank_resumes_after_the_cooldown(self, vendor):
        self._answers(vendor, 402)
        await rerank.rerank_passages('q', ['a'])
        rerank._cooldown['until'] = time.monotonic() - 1
        await rerank.rerank_passages('q', ['a'])
        assert vendor.post.await_count == 2

    @pytest.mark.asyncio
    async def test_a_healthy_vendor_is_unaffected(self, vendor):
        self._answers(vendor, 200, json={'results': [{'index': 1, 'relevance_score': 0.9}]})
        assert await rerank.rerank_passages('q', ['a', 'b']) == [0.0, 0.9]
        assert rerank._cooldown['until'] == 0.0


class TestFaithfulnessNotice:
    @pytest.mark.asyncio
    async def test_returns_the_annotation_with_its_count(self):
        from app.services.companion.faithfulness import faithfulness_notice
        with patch('app.services.companion.faithfulness.check_faithfulness',
                   new=AsyncMock(return_value=[0])):
            notice = await faithfulness_notice('Unsupported claim. Supported fact.', [])
        assert notice is not None
        annotation, count = notice
        assert count == 1
        assert 'Unsupported claim' in annotation

    @pytest.mark.asyncio
    async def test_nothing_flagged_or_check_unavailable_means_no_notice(self):
        from app.services.companion.faithfulness import faithfulness_notice
        with patch('app.services.companion.faithfulness.check_faithfulness',
                   new=AsyncMock(return_value=None)):
            assert await faithfulness_notice('answer', []) is None
        with patch('app.services.companion.faithfulness.check_faithfulness',
                   new=AsyncMock(side_effect=RuntimeError('check down'))):
            assert await faithfulness_notice('answer', []) is None


class TestStreamCompletionOrder:
    @pytest.mark.asyncio
    async def test_warning_precedes_the_persisted_id_and_done_is_last(self):
        async def provider_stream(*args, **kwargs):
            yield 'data: {"content": "answer"}\n\n'

        order = []

        async def persist(*args, **kwargs):
            order.append('persist')
            return UUID(int=9)

        async def notice(answer, messages):
            order.append('notice')
            return '⚠️ note', 2

        with patch.object(streaming, 'get_registry', MagicMock()), \
             patch.object(streaming, 'release_db', AsyncMock()), \
             patch.object(streaming, '_get_stream_provider', lambda r, rid: (MagicMock(), 'glm', 'big')), \
             patch.object(streaming, '_stream_from_provider', provider_stream), \
             patch.object(streaming, '_persist_with_retry', persist), \
             patch.object(streaming, 'faithfulness_notice', notice), \
             patch.object(streaming, '_settle_token_budget', AsyncMock()), \
             patch('app.services.llm.observability.capture_llm_content', MagicMock()):
            chunks = [c async for c in streaming._stream_via_provider(
                None, _UID, _BID, 'q', [], 'en', emit_request_id=False,
            )]

        def payload(chunk):
            body = chunk[chunk.rindex('data: ') + len('data: '):].strip()
            return None if body == '[DONE]' else json.loads(body)

        kinds = [('done' if (f := payload(c)) is None else f.get('type') or 'content') for c in chunks]
        assert kinds == ['content', 'faithfulness_warning', 'message_id', 'done']
        assert payload(chunks[1])['unsupported_count'] == 2
        assert order == ['persist', 'notice'], 'both start together; neither waits for the other'


class TestSummaryRefreshRunsInBackground:
    """Once a conversation passes the threshold, the summary regeneration —
    a model call on the default tier — ran BEFORE the first token under a
    20s budget. A rate-limited turn spent all of it there."""

    @pytest.fixture(autouse=True)
    def _drain(self):
        import app.services.conversation_memory as cm
        yield
        for task in list(cm._tasks):
            task.cancel()
        cm._refreshing.clear()

    @pytest.mark.asyncio
    async def test_the_turn_returns_the_stored_summary_without_a_model_call(self):
        import app.services.conversation_memory as cm
        stored = SimpleNamespace(summary='之前聊过的内容', message_count=10)
        with patch.object(cm, '_load_existing_summary', new=AsyncMock(return_value=stored)), \
             patch.object(cm, '_is_summary_stale', return_value=False), \
             patch.object(cm, 'get_or_create_summary', new=AsyncMock()) as regenerate, \
             patch.object(cm, 'schedule_summary_refresh', return_value=False):
            text = await context_enrichment.fetch_memory(None, _UID, _BID)
        assert text == '之前聊过的内容'
        assert regenerate.await_count == 0, 'the turn must not wait on a model'

    @pytest.mark.asyncio
    async def test_no_summary_yet_is_an_empty_string_not_an_error(self):
        import app.services.conversation_memory as cm
        with patch.object(cm, '_load_existing_summary', new=AsyncMock(return_value=None)), \
             patch.object(cm, 'schedule_summary_refresh', return_value=True):
            assert await context_enrichment.fetch_memory(None, _UID, _BID) == ''

    @pytest.mark.asyncio
    async def test_a_stale_version_row_is_not_served(self):
        import app.services.conversation_memory as cm
        stored = SimpleNamespace(summary='old schema output', message_count=10)
        with patch.object(cm, '_load_existing_summary', new=AsyncMock(return_value=stored)), \
             patch.object(cm, '_is_summary_stale', return_value=True), \
             patch.object(cm, 'schedule_summary_refresh', return_value=False):
            assert await context_enrichment.fetch_memory(None, _UID, _BID) == ''

    @pytest.mark.asyncio
    async def test_a_refresh_is_scheduled_once_per_conversation_until_it_finishes(self):
        import app.services.conversation_memory as cm
        started, release = asyncio.Event(), asyncio.Event()

        async def slow_refresh(db, user_id, book_id):
            started.set()
            await release.wait()

        class _Session:
            async def __aenter__(self):
                return None

            async def __aexit__(self, *exc):
                return False

        with patch.object(cm, 'get_or_create_summary', new=slow_refresh), \
             patch('app.db.async_session', return_value=_Session()):
            assert cm.schedule_summary_refresh(_UID, _BID) is True
            await started.wait()
            assert cm.schedule_summary_refresh(_UID, _BID) is False, 'already refreshing'
            assert cm.schedule_summary_refresh(_UID, UUID(int=3)) is True, 'another conversation'
            release.set()
            await asyncio.gather(*cm._tasks)

        assert cm._refreshing == set(), 'the guard is released when the refresh ends'
        assert cm.schedule_summary_refresh(_UID, _BID) is True

    @pytest.mark.asyncio
    async def test_a_failed_refresh_releases_the_guard_and_never_raises(self):
        import app.services.conversation_memory as cm

        class _Session:
            async def __aenter__(self):
                return None

            async def __aexit__(self, *exc):
                return False

        with patch.object(cm, 'get_or_create_summary',
                          new=AsyncMock(side_effect=RuntimeError('vendor down'))), \
             patch('app.db.async_session', return_value=_Session()):
            cm.schedule_summary_refresh(_UID, _BID)
            await asyncio.gather(*cm._tasks)
        assert cm._refreshing == set()
