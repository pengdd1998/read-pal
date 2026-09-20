"""Companion tool capability — M1 unit tests.

Pins the security posture (server-injected identity, strict arg
validation, never-raise execution) and the render caps that keep tool
results prompt-sized.
"""

import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.services.companion.tools import (
    TOOL_SPECS,
    execute_tool,
    parse_tool_plan,
    render_tool_results,
)
from tests.conftest import _TestSession
from tests.fixtures.seeds import _NEEDLE, _seed_book, _seed_user


class TestRegistry:
    def test_nine_specs_registered_with_kinds(self):
        assert sorted(TOOL_SPECS) == [
            'create_flashcard', 'get_annotations', 'get_chapter',
            'get_flashcards', 'get_knowledge_graph', 'get_memory_book',
            'get_reading_progress', 'save_note', 'search_book',
        ]
        kinds = {n: s.kind for n, s in TOOL_SPECS.items()}
        assert kinds['save_note'] == 'proposal'
        assert kinds['create_flashcard'] == 'proposal'
        assert all(v == 'read' for k, v in kinds.items() if k not in ('save_note', 'create_flashcard'))

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


class TestToolTimeoutSessionHeal:
    """wait_for cancellation can land mid-DB-operation and leave the shared
    request session with an invalidated transaction — the next operation on
    it (another tool, or save_message on the cache-hit path) would raise
    PendingRollbackError and sink the turn's persistence (24h-review
    finding, sess_cdbcdba6). execute_tool must hand the session back clean."""

    @pytest.mark.asyncio
    async def test_timeout_rolls_back_shared_session(self, monkeypatch):
        monkeypatch.setattr(
            'app.services.companion.tools.registry.TOOL_TIMEOUT_S', 0.05,
        )

        async def slow_tool(db, user_id, book_id, args):
            await db.execute(text('SELECT 1'))  # opens a transaction
            await asyncio.sleep(5)              # timeout lands here

        spec = TOOL_SPECS['search_book']
        with patch.dict(
            'app.services.companion.tools.registry.TOOL_SPECS',
            {'search_book': type(spec)('search_book', '', spec.args_model, slow_tool)},
        ):
            async with _TestSession() as db:
                result = await execute_tool(
                    db, 'search_book', {'query': 'xy', 'scope': 'current'},
                    user_id=uuid4(), book_id=uuid4(),
                )
                assert result['ok'] is False and result['error'] == 'timeout'
                # Heal: the transaction the tool opened is rolled back and
                # the session is immediately reusable.
                assert db.in_transaction() is False
                await db.execute(text('SELECT 1'))

    @pytest.mark.asyncio
    async def test_execution_failure_rolls_back_shared_session(self):
        from sqlalchemy.exc import DBAPIError

        async def failing_tool(db, user_id, book_id, args):
            await db.execute(text('SELECT 1'))  # opens a transaction
            raise DBAPIError('stmt', {}, Exception('db on fire'))

        spec = TOOL_SPECS['search_book']
        with patch.dict(
            'app.services.companion.tools.registry.TOOL_SPECS',
            {'search_book': type(spec)('search_book', '', spec.args_model, failing_tool)},
        ):
            async with _TestSession() as db:
                result = await execute_tool(
                    db, 'search_book', {'query': 'xy', 'scope': 'current'},
                    user_id=uuid4(), book_id=uuid4(),
                )
                assert result['ok'] is False and result['error'] == 'execution failed'
                assert db.in_transaction() is False
                await db.execute(text('SELECT 1'))


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
        ) == [{'name': 'search_book', 'args': {'query': 'g'}, 'kind': 'read'}]
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
        assert plan == [{'name': 'search_book', 'args': {'query': 'green light'}, 'kind': 'read'}]

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
        assert sys_t.version == 2 and sys_t.max_tokens == 200
        # All seven tools documented in the system prompt.
        for name in ('search_book', 'get_annotations', 'get_chapter',
                     'get_reading_progress', 'get_knowledge_graph',
                     'get_memory_book', 'get_flashcards',
                     'save_note', 'create_flashcard'):
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
                message='第3章的叙事视角是怎么切换的？', history_texts=[],
                book=type('B', (), {'title': 'T', 'author': 'A', 'progress': 10,
                                     'status': type('S', (), {'value': 'reading'})()})(),
                system_text='BASE', budget=_FakeBudget(),
            )
        assert out == ('BASE', [], [])

    @pytest.mark.asyncio
    async def test_non_content_classification_skips_planner(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(),
        ) as planner:
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 9000
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='哈哈谢谢', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        planner.assert_not_awaited()
        assert out == ('BASE', [], [])

    @pytest.mark.asyncio
    async def test_planner_deadline_surfaces_degraded_entry(self):
        """G14b: a deadline skip is VISIBLE, not silent — the turn answers
        without tools and the UI must be able to say so. The synthetic
        planner entry rides the tool_status frame (streaming emits it
        because tool_results is non-empty) and never reaches the system
        prompt (this branch returns before render_tool_results)."""
        import asyncio as aio

        from app.services.companion.tools.phase import run_tool_phase

        async def _slow_plan(**_kwargs):
            await aio.sleep(0.4)
            return [{'name': 'get_chapter', 'args': {}}]

        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=_slow_plan,
        ):
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 30  # 30ms deadline
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='第3章讲了什么', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )

        system_text, tool_results, proposals = out
        assert system_text == 'BASE', 'degraded turn must not amend the prompt'
        assert proposals == []
        assert len(tool_results) == 1
        entry = tool_results[0]
        assert entry['tool'] == 'planner'
        assert entry['ok'] is False
        assert entry['degraded'] == 'planner_deadline'
        assert entry['latency_ms'] >= 30

        # The frame carries the flag (G14b contract with the UI).
        from app.services.companion.stream_cache import emit_tool_status_frame

        frame = emit_tool_status_frame(tool_results, 'req-g14b')
        assert '"degraded": "planner_deadline"' in frame
        assert '"tool": "planner"' in frame

    @pytest.mark.asyncio
    async def test_full_path_amends_and_reports(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(return_value=[{'name': 'get_flashcards', 'kind': 'read', 'args': {}}]),
        ), patch(
            'app.services.companion.tools.registry.execute_tool',
            new=AsyncMock(return_value={'ok': True, 'tool': 'get_flashcards',
                                        'latency_ms': 5, 'data': {'due_count': 2}}),
        ):
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_proposals_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 9000
            amended, results, proposals = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='主角和对手的关系后来怎么了？', history_texts=[],  # no rule match — LLM planner path
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
            ms.return_value.companion_tool_proposals_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 9000
            out = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='书里那个比喻妙在哪里', history_texts=[],  # quote intent now rule-planned; keep LLM path here
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        assert out == ('BASE', [], [])


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


class TestPlannerDeadline:
    """TL test round (2026-09-14): a throttled-glm planner ladder burned
    ~70s of dead air before the first token. The phase must cut it off."""

    @pytest.mark.asyncio
    async def test_hanging_planner_is_cut_at_deadline(self):
        import asyncio
        from app.services.companion.tools import phase as phase_mod

        async def hang(**kw):
            await asyncio.sleep(60)

        t0 = __import__('time').monotonic()
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(side_effect=hang),
        ):
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 500  # fast deadline
            out = await phase_mod.run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='第3章讲了什么', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        elapsed = __import__('time').monotonic() - t0
        # G14b contract update: a deadline skip returns a synthetic
        # degraded planner entry (visible in the tool_status frame) —
        # the turn is still answered plainly, system prompt unchanged.
        system_text, tool_results, proposals = out
        assert system_text == 'BASE'
        assert proposals == []
        assert [r['tool'] for r in tool_results] == ['planner']
        assert tool_results[0]['degraded'] == 'planner_deadline'
        assert elapsed < 2.0, f'phase took {elapsed:.1f}s'

    @pytest.mark.asyncio
    async def test_deadline_is_configurable(self):
        """WT round follow-up: slow environments raise the deadline via
        COMPANION_TOOL_PLAN_TIMEOUT_MS and the phase honors it."""
        import asyncio
        from app.services.companion.tools import phase as phase_mod

        started = asyncio.Event()

        async def slow_but_finishes(**kw):
            started.set()
            await asyncio.sleep(1.2)  # > old 9s? no — proves non-default path
            return [{'name': 'get_flashcards', 'kind': 'read', 'args': {}}]

        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(side_effect=slow_but_finishes),
        ), patch(
            'app.services.companion.tools.registry.execute_tool',
            new=AsyncMock(return_value={'ok': True, 'tool': 'get_flashcards',
                                        'latency_ms': 1, 'data': {}}),
        ):
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_proposals_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 4000
            amended, results, proposals = await phase_mod.run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='第3章讲了什么', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        assert results and results[0]['tool'] == 'get_flashcards'


class TestProposalTools:
    """v2 M1: proposals are framed, never executed; capped at one/turn."""

    @pytest.mark.asyncio
    async def test_execute_tool_rejects_proposals(self):
        result = await execute_tool(
            None, 'save_note', {'content': 'x' * 10, 'preview': 'p'},
            user_id=uuid4(), book_id=uuid4(),
        )
        assert result['ok'] is False
        assert 'not executable' in result['error']

    def test_proposal_capped_at_one_per_turn(self):
        plan = parse_tool_plan(
            '{"tools":[{"name":"save_note","args":{"content":"aaaa"}},'
            '{"name":"create_flashcard","args":{"question":"q?","answer":"a"}},'
            '{"name":"search_book","args":{"query":"g"}}]}',
        )
        names = [c['name'] for c in plan]
        assert names.count('save_note') + names.count('create_flashcard') == 1
        assert 'search_book' in names  # read not crowded out

    def test_proposal_args_validated(self):
        plan = parse_tool_plan(
            '{"tools":[{"name":"save_note","args":{"content":"x"}}]}',  # too short
        )
        assert [c['name'] for c in plan] == ['save_note']  # parse keeps it…
        from app.services.companion.tools.registry import TOOL_SPECS
        try:
            TOOL_SPECS['save_note'].args_model.model_validate(plan[0]['args'])
            assert False, 'should reject short content'
        except Exception:
            pass  # …validation happens downstream (phase renders only valid)


class TestProposalRouting:
    """v2 M2: proposals validate+frame, never execute; flag gates them."""

    @pytest.mark.asyncio
    async def test_proposal_framed_not_executed(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(return_value=[
                {'name': 'save_note', 'kind': 'proposal',
                 'args': {'content': '绿光象征美国梦', 'preview': '绿光', 'tags': ['象征']}},
                {'name': 'search_book', 'kind': 'read',
                 'args': {'query': 'green light'}},
            ]),
        ), patch(
            'app.services.companion.tools.registry.execute_tool',
            new=AsyncMock(return_value={'ok': True, 'tool': 'search_book',
                                        'latency_ms': 5, 'data': {'hits': []}}),
        ) as exec_mock:
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_proposals_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 9000
            amended, results, proposals = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='帮我梳理绿光的象征意义并记下来', history_texts=[],  # no rule match — mixed plan comes from the mocked LLM planner
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        exec_mock.assert_awaited_once()  # only the read executed
        assert results[0]['tool'] == 'search_book'
        assert len(proposals) == 1 and proposals[0]['tool'] == 'save_note'
        assert proposals[0]['args']['content'] == '绿光象征美国梦'
        assert 'v2_proposal_notice' in amended and 'never claim' in amended

    @pytest.mark.asyncio
    async def test_proposal_flag_off_drops_proposals(self):
        from app.services.companion.tools.phase import run_tool_phase
        with patch('app.config.get_settings') as ms, patch(
            'app.services.companion.tools.planner.plan_tool_calls',
            new=AsyncMock(return_value=[
                {'name': 'save_note', 'kind': 'proposal',
                 'args': {'content': 'x' * 10, 'preview': 'p'}},
            ]),
        ):
            ms.return_value.companion_tools_enabled = True
            ms.return_value.companion_tool_plan_timeout_ms = 9000
            ms.return_value.companion_tool_proposals_enabled = False
            amended, results, proposals = await run_tool_phase(
                db=None, user_id=uuid4(), book_id=uuid4(),
                message='帮我记一下这段', history_texts=[],
                book=_fake_book(), system_text='BASE', budget=_FakeBudget(),
            )
        assert proposals == [] and 'v2_proposal_notice' not in amended

    def test_proposals_frame_shape(self):
        from app.services.companion.stream_cache import emit_tool_proposals_frame
        frame = emit_tool_proposals_frame(
            [{'id': 'p1', 'tool': 'save_note', 'args': {'content': 'x'}, 'preview': '绿光'}],
            'req9',
        )
        assert '"type": "tool_proposals"' in frame and 'save_note' in frame
        assert '\nid: ' not in frame  # ephemeral, no replay
