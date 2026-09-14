"""Companion tool capability — M1 unit tests.

Pins the security posture (server-injected identity, strict arg
validation, never-raise execution) and the render caps that keep tool
results prompt-sized.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.companion.tools import (
    TOOL_SPECS,
    execute_tool,
    parse_tool_plan,
    render_tool_results,
)
from tests.conftest import _TestSession
from tests.test_research_agent import _NEEDLE, _seed_book, _seed_user


class TestRegistry:
    def test_seven_specs_registered(self):
        assert sorted(TOOL_SPECS) == [
            'get_annotations', 'get_chapter', 'get_flashcards',
            'get_knowledge_graph', 'get_memory_book',
            'get_reading_progress', 'search_book',
        ]

    @pytest.mark.asyncio
    async def test_invalid_args_never_raise(self):
        result = await execute_tool(
            None, 'search_book', {'query': 'x', 'scope': 'everywhere'},
            user_id=uuid4(), book_id=uuid4(),
        )
        assert result['ok'] is False and 'invalid args' in result['error']

    @pytest.mark.asyncio
    async def test_unknown_tool(self):
        result = await execute_tool(
            None, 'rm_rf', {}, user_id=uuid4(), book_id=uuid4(),
        )
        assert result['ok'] is False and result['error'] == 'unknown tool'

    @pytest.mark.asyncio
    async def test_model_supplied_identity_ignored(self):
        """user_id/book_id from model args must be dropped — identity is
        server-injected only (same review standard as the boundary gate)."""
        impl = TOOL_SPECS['get_reading_progress'].fn
        spy = AsyncMock(wraps=impl)
        with patch.dict(
            'app.services.companion.tools.registry.TOOL_SPECS',
            {'get_reading_progress': type(TOOL_SPECS['get_reading_progress'])(
                'get_reading_progress', '', TOOL_SPECS['get_reading_progress'].args_model, spy,
            )},
        ):
            await execute_tool(
                None, 'get_reading_progress',
                {'user_id': str(uuid4()), 'book_id': str(uuid4())},
                user_id=uuid4(), book_id=uuid4(),
            )
        # fn receives exactly (db, user_id, book_id, args-dict)
        assert len(spy.await_args.args) == 4

    @pytest.mark.asyncio
    async def test_execution_failure_is_payload_not_exception(self):
        async def boom(*a, **kw):
            raise RuntimeError('db on fire')
        spec = TOOL_SPECS['get_flashcards']
        with patch.dict(
            'app.services.companion.tools.registry.TOOL_SPECS',
            {'get_flashcards': type(spec)('get_flashcards', '', spec.args_model, boom)},
        ):
            result = await execute_tool(
                None, 'get_flashcards', {}, user_id=uuid4(), book_id=uuid4(),
            )
        assert result['ok'] is False and result['error'] == 'execution failed'


class TestSearchBook:
    @pytest.mark.asyncio
    async def test_current_scope_uses_hybrid(self):
        with patch(
            'app.services.rag.search.hybrid_chunk_search',
            new=AsyncMock(return_value=[
                {'title': 'Ch1', 'content': _NEEDLE + ' ' + 'x' * 400, 'similarity': 0.9},
            ]),
        ) as hybrid:
            from app.services.companion.tools import search_book
            out = await search_book(None, uuid4(), uuid4(), {'query': _NEEDLE})
        hybrid.assert_awaited_once()
        assert out['scope'] == 'current' and len(out['hits']) == 1
        assert len(out['hits'][0]['excerpt']) <= 300  # excerpt cap

    @pytest.mark.asyncio
    async def test_library_scope_uses_cross_book(self):
        with patch(
            'app.services.rag.cross_book.cross_book_search',
            new=AsyncMock(return_value=[
                {'book_title': 'Other', 'title': 'Ch2', 'content': 'hit', 'similarity': 0.8},
            ]),
        ) as cross:
            from app.services.companion.tools import search_book
            out = await search_book(None, uuid4(), uuid4(),
                                    {'query': 'theme', 'scope': 'library'})
        cross.assert_awaited_once()
        assert out['hits'][0]['book'] == 'Other'


class TestGetChapter:
    @pytest.mark.asyncio
    async def test_range_and_ownership(self):
        from sqlalchemy import update as sa_update
        from app.models.document import Document

        async with _TestSession() as session:
            uid = await _seed_user(session)
            book = await _seed_book(session, uid, title='T', chunks=[(0, 'a'), (1, 'b')])
            # The research seed helper leaves Document.chapters empty (it
            # targets book_chunks); get_chapter reads the parse payload.
            await session.execute(
                sa_update(Document).where(Document.book_id == book).values(
                    chapters=[
                        {'title': 'One', 'content': 'a'},
                        {'title': 'Two', 'content': 'b'},
                    ],
                ),
            )
            await session.commit()
            from app.services.companion.tools import get_chapter
            ok = await get_chapter(session, uid, book, {'index': 2})
            assert ok['content'] == 'b' and ok['total_chapters'] == 2
            oob = await get_chapter(session, uid, book, {'index': 3})
            assert 'out of range' in oob['error']
            # Foreign book id resolves to not-found (no existence leak).
            foreign = await get_chapter(session, uid, uuid4(), {'index': 1})
            assert foreign['error'] == 'book not found'


class TestSkeletonTools:
    @pytest.mark.asyncio
    async def test_knowledge_graph_skeleton(self):
        nodes = [{'id': f'n{i}', 'label': f'L{i}', 'type': 'theme'} for i in range(50)]
        edges = [{'source': f'n{i}', 'target': 'n0', 'label': 'rel'} for i in range(1, 50)]
        with patch(
            'app.services.knowledge.get_all_cached_graphs',
            new=AsyncMock(return_value={'nodes': nodes, 'edges': edges}),
        ):
            from app.services.companion.tools import get_knowledge_graph
            out = await get_knowledge_graph(None, uuid4(), uuid4(), {})
        assert out['generated'] is True
        assert out['total_nodes'] == 50 and len(out['top_concepts']) == 10
        assert out['top_concepts'][0]['label'] == 'L0'  # most connected

    @pytest.mark.asyncio
    async def test_memory_book_skeleton_no_html(self):
        mb = {
            'generatedAt': '2026-09-14',
            'sections': [{'title': f'S{i}'} for i in range(12)],
            'stats': {'totalHighlights': 7, 'totalNotes': 2, 'readingDuration': 900},
            'htmlContent': '<html>' + 'x' * 20_000,
        }
        with patch(
            'app.services.reading_book_service.get_memory_book',
            new=AsyncMock(return_value=mb),
        ):
            from app.services.companion.tools import get_memory_book as tool
            out = await tool(None, uuid4(), uuid4(), {})
        assert out['generated'] is True
        assert len(out['sections']) == 10 and 'htmlContent' not in str(out)

    @pytest.mark.asyncio
    async def test_flashcards_fronts_only(self):
        class Card:
            def __init__(self, q):
                self.question = q
        with patch(
            'app.services.flashcard.get_due_cards',
            new=AsyncMock(return_value=[Card('q' * 200)]),
        ):
            from app.services.companion.tools import get_flashcards
            out = await get_flashcards(None, uuid4(), uuid4(), {})
        assert out['due_count'] == 1
        assert len(out['cards'][0]['question']) <= 120
        assert 'answer' not in str(out).lower() or 'answer' not in out['cards'][0]


class TestProtocol:
    def test_valid_and_fenced(self):
        assert parse_tool_plan(
            '{"tools":[{"name":"search_book","args":{"query":"g"}}]}',
        ) == [{'name': 'search_book', 'args': {'query': 'g'}}]
        assert parse_tool_plan(
            'plan:\n```json\n{"tools":[{"name":"get_chapter","args":{"index":3}}]}\n```',
        )[0]['args'] == {'index': 3}

    def test_degrades_on_junk(self):
        for junk in ('', '直接回答', 'no json here', '{"tools": "yes"}', '[1,2,3]'):
            assert parse_tool_plan(junk) == []

    def test_unknown_dropped_and_cap_two(self):
        out = parse_tool_plan(
            '{"tools":[{"name":"hack"},{"name":"get_flashcards"},'
            '{"name":"get_reading_progress"},{"name":"get_chapter","args":{"index":1}}]}',
        )
        assert [c['name'] for c in out] == ['get_flashcards', 'get_reading_progress']


class TestRender:
    def test_untrusted_wrapper(self):
        s = render_tool_results([{'ok': True, 'tool': 'search_book', 'data': {'hits': []}}])
        assert s.startswith('<tool_results>') and 'never' in s

    def test_failed_results_render_empty(self):
        assert render_tool_results([{'ok': False}]) == ''


class TestPlanner:
    """M2: the planning call degrades to [] on every failure mode."""

    @pytest.mark.asyncio
    async def test_valid_plan_flows_through_parser(self):
        from app.services.companion.tools import plan_tool_calls
        with patch(
            'app.services.llm.safe_llm_invoke',
            new=AsyncMock(return_value={'tools': [
                {'name': 'search_book', 'args': {'query': 'green light'}},
            ]}),
        ):
            plan = await plan_tool_calls(
                user_id=uuid4(), book_id=uuid4(), message='原文是什么？',
                book_title='Gatsby', book_author='Fitz', progress=10,
                status='reading', has_rag=True, has_annotations=False,
            )
        assert plan == [{'name': 'search_book', 'args': {'query': 'green light'}}]

    @pytest.mark.asyncio
    async def test_fallback_value_means_no_tools(self):
        from app.services.companion.tools import plan_tool_calls
        # safe_llm_invoke's fallback for this schema IS the empty plan.
        with patch(
            'app.services.llm.safe_llm_invoke',
            new=AsyncMock(return_value={'tools': []}),
        ):
            plan = await plan_tool_calls(
                user_id=uuid4(), book_id=uuid4(), message='anything',
                book_title='T', book_author='A', progress=0,
                status='reading', has_rag=False, has_annotations=False,
            )
        assert plan == []

    @pytest.mark.asyncio
    async def test_unknown_tool_from_llm_is_dropped(self):
        from app.services.companion.tools import plan_tool_calls
        with patch(
            'app.services.llm.safe_llm_invoke',
            new=AsyncMock(return_value={'tools': [
                {'name': 'delete_everything', 'args': {}},
                {'name': 'get_flashcards', 'args': {}},
            ]}),
        ):
            plan = await plan_tool_calls(
                user_id=uuid4(), book_id=uuid4(), message='x',
                book_title='T', book_author='A', progress=0,
                status='reading', has_rag=False, has_annotations=False,
            )
        assert [c['name'] for c in plan] == ['get_flashcards']

    def test_templates_registered_and_pinned(self):
        from app.prompts import ALL_TEMPLATES
        sys_t = ALL_TEMPLATES['companion.tool_plan']
        human = ALL_TEMPLATES['companion.tool_plan.human']
        assert sys_t.version == 1 and sys_t.max_tokens == 200
        # All seven tools documented in the system prompt.
        for name in ('search_book', 'get_annotations', 'get_chapter',
                     'get_reading_progress', 'get_knowledge_graph',
                     'get_memory_book', 'get_flashcards'):
            assert name in sys_t.template, name
        # Variables declared (Never-rule 4) and renderable.
        human.template.format(title='t', author='a', progress=1,
                              status='reading', context_summary='c', message='m')


class TestToolPhase:
    """M3: the phase only ever amends; every bypass returns identity."""

    @pytest.mark.asyncio
    async def test_disabled_flag_is_noop(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms:
            ms.return_value.companion_tools_enabled = False
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='第3章讲了什么', history_texts=[],
                book=type('B', (), {'title': 'T', 'author': 'A', 'progress': 10,
                                     'status': type('S', (), {'value': 'reading'})()})(),
                system_text='BASE', budget=_FakeBudget(),
            )
        assert out == ('BASE', [])

    @pytest.mark.asyncio
    async def test_non_content_classification_skips_planner(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(),
        ) as planner:
            ms.return_value.companion_tools_enabled = True
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='哈哈谢谢', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        planner.assert_not_awaited()
        assert out == ('BASE', [])

    @pytest.mark.asyncio
    async def test_full_path_amends_and_reports(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(return_value=[{'name': 'get_flashcards', 'args': {}}]),
        ), patch(
            'app.services.companion.tools.registry.execute_tool',
            new=AsyncMock(return_value={'ok': True, 'tool': 'get_flashcards',
                                        'latency_ms': 5, 'data': {'due_count': 2}}),
        ):
            ms.return_value.companion_tools_enabled = True
            amended, results = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='第3章的角色关系是什么？', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        assert 'BASE' in amended and 'tool_results' in amended and 'due_count' in amended
        assert results[0]['tool'] == 'get_flashcards'

    @pytest.mark.asyncio
    async def test_empty_plan_is_identity(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(return_value=[]),
        ):
            ms.return_value.companion_tools_enabled = True
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='书里那个比喻的原文是什么', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        assert out == ('BASE', [])


class TestToolStatusFrame:
    def test_frame_shape_and_no_replay(self):
        from app.services.companion.stream_cache import emit_tool_status_frame
        frame = emit_tool_status_frame(
            [{'tool': 'search_book', 'ok': True, 'latency_ms': 120}], 'req123',
        )
        assert '"type": "tool_status"' in frame or '"type":"tool_status"' in frame
        assert 'search_book' in frame and frame.startswith('data: ')
        # Ephemeral by design: no id line (reconnect replay unaffected).
        assert '\nid: ' not in frame


def _fake_book():
    return type('B', (), {
        'title': 'T', 'author': 'A', 'progress': 10,
        'status': type('S', (), {'value': 'reading'})(),
    })()


class _FakeBudget:
    """Minimal budget stub: add() returns text unchanged."""

    def add(self, text, label):
        return text
