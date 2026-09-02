"""Phase 2 synthesis multi-mode tests.

Layers: mode resolution (explicit + field inference + aliases), each
mode's orchestration with a mocked ``safe_llm_invoke`` (retrieval mocked
or seeded), severity/type post-filters, router dispatch and legacy
backward-compat, plus eval wiring.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.prompts import ALL_TEMPLATES
from app.schemas.llm_outputs import (
    ConceptMapResult,
    ContradictionList,
    CrossReferenceResult,
    SummaryReportResult,
)
from app.schemas.synthesis import SynthesisRequest
from app.services.agent.synthesis_modes import (
    resolve_synthesis_mode,
    run_concept_map,
    run_contradictions,
    run_cross_reference,
    run_summary_report,
    run_synthesis_mode,
)
from tests.conftest import _TestSession, auth_headers, register_user
from tests.test_research_agent import _NEEDLE, _seed_book, _seed_user


def _body(**kwargs) -> SynthesisRequest:
    return SynthesisRequest(**kwargs)


def _xr_result() -> dict:
    return CrossReferenceResult(
        concept="c",
        source={"title": "S", "author": "A"},
        analysis="analysis",
        references=[
            {"book": {"title": "B1", "author": "A1"}, "type": "supporting", "explanation": "e1"},
            {"book": {"title": "B2", "author": "A2"}, "type": "contradicting", "explanation": "e2"},
        ],
    ).model_dump()


def _ctr_result() -> dict:
    return ContradictionList(
        contradictions=[
            {
                "topic": "t",
                "severity": "low",
                "position1": {"book": {"title": "B1", "author": "A"}, "claim": "c1"},
                "position2": {"book": {"title": "B2", "author": "A"}, "claim": "c2"},
                "analysis": "a",
            },
            {
                "topic": "t2",
                "severity": "high",
                "position1": {"book": {"title": "B1", "author": "A"}, "claim": "c1"},
                "position2": {"book": {"title": "B2", "author": "A"}, "claim": "c2"},
                "analysis": "a",
            },
        ]
    ).model_dump()


def _search_hit(book_title: str) -> list[dict]:
    return [
        {
            "book_id": str(uuid4()),
            "book_title": book_title,
            "author": "A",
            "title": "Chapter 1",
            "content": f"{_NEEDLE}内容",
            "similarity": 0.5,
        }
    ]


# ---------------------------------------------------------------------------
# Mode resolution
# ---------------------------------------------------------------------------


class TestResolveSynthesisMode:
    def test_explicit_mode_and_aliases(self):
        assert resolve_synthesis_mode(_body(mode="cross_reference")) == "cross_reference"
        assert resolve_synthesis_mode(_body(mode="concept_map")) == "concept_map"
        assert resolve_synthesis_mode(_body(mode="find_contradictions")) == "contradictions"
        assert resolve_synthesis_mode(_body(mode="contradictions")) == "contradictions"
        assert resolve_synthesis_mode(_body(mode="summary_report")) == "summary_report"
        assert resolve_synthesis_mode(_body(mode="summary")) == "summary_report"

    def test_synthesize_and_none_stay_legacy(self):
        assert resolve_synthesis_mode(_body(mode="synthesize")) is None
        assert resolve_synthesis_mode(None) is None
        assert resolve_synthesis_mode(_body(query="q")) is None
        assert resolve_synthesis_mode(_body()) is None

    def test_field_inference_when_mode_absent(self):
        # The panel didn't send mode before the upgrade — the distinctive
        # fields must still route to the right backend.
        assert resolve_synthesis_mode(_body(concept="c", analysis_type="all")) == "cross_reference"
        assert resolve_synthesis_mode(_body(topic="t", max_nodes=20)) == "concept_map"
        assert resolve_synthesis_mode(_body(topic="t", min_severity="low")) == "contradictions"
        assert resolve_synthesis_mode(_body(format="narrative")) == "summary_report"
        assert resolve_synthesis_mode(_body(focus="f")) == "summary_report"


# ---------------------------------------------------------------------------
# Mode orchestration
# ---------------------------------------------------------------------------


class TestModeOrchestration:
    @pytest.mark.asyncio
    async def test_cross_reference_filters_by_analysis_type(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="Source",
                chunks=[
                    (0, f"{_NEEDLE}源内容"),
                ],
            )
            invoke = AsyncMock(return_value=_xr_result())
            search = AsyncMock(return_value=_search_hit("Library Book"))
            with (
                patch("app.services.agent.synthesis_modes._shared.safe_llm_invoke", invoke),
                patch("app.services.agent.synthesis_modes.content_modes.cross_book_search", search),
            ):
                result = await run_cross_reference(
                    session,
                    uid,
                    _body(concept="c", analysis_type="contradicting"),
                    _uuid(book_id),
                )

        assert result["success"] is True
        refs = result["data"]["references"]
        assert len(refs) == 1 and refs[0]["type"] == "contradicting"
        # Library-wide search: no book_ids passed.
        assert search.await_args.kwargs.get("book_ids") is None

    @pytest.mark.asyncio
    async def test_cross_reference_missing_book(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            result = await run_cross_reference(
                session,
                uid,
                _body(concept="c"),
                uuid4(),
            )
        assert result["success"] is False
        assert result["error"] == "Book not found"

    @pytest.mark.asyncio
    async def test_concept_map_caps_and_fuses(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            invoke = AsyncMock(
                return_value=ConceptMapResult(
                    nodes=[
                        {"id": "n1", "label": "L", "type": "concept", "weight": 0.5},
                    ],
                    edges=[],
                ).model_dump()
            )
            search = AsyncMock(return_value=_search_hit("Any"))
            with (
                patch("app.services.agent.synthesis_modes._shared.safe_llm_invoke", invoke),
                patch("app.services.agent.synthesis_modes.content_modes.cross_book_search", search),
            ):
                result = await run_concept_map(
                    session,
                    uid,
                    _body(topic="t", max_nodes=10),
                )
        assert result["success"] is True
        assert result["data"]["nodes"][0]["id"] == "n1"
        # total_k scales with the node cap.
        assert search.await_args.kwargs.get("total_k") == 20

    @pytest.mark.asyncio
    async def test_contradictions_severity_floor(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="B1",
                chunks=[
                    (0, f"{_NEEDLE}一方"),
                ],
            )
            invoke = AsyncMock(return_value=_ctr_result())
            with (
                patch("app.services.agent.synthesis_modes._shared.safe_llm_invoke", invoke),
                patch(
                    "app.services.agent.synthesis_modes.content_modes.cross_book_search",
                    AsyncMock(return_value=_search_hit("B")),
                ),
            ):
                result = await run_contradictions(
                    session,
                    uid,
                    _body(topic="t", min_severity="high", book_ids=[_uuid(book_id)]),
                    _uuid(book_id),
                )
        kept = result["data"]["contradictions"]
        assert len(kept) == 1 and kept[0]["severity"] == "high"

    @pytest.mark.asyncio
    async def test_contradictions_empty_llm_list_is_partial(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="B",
                chunks=[
                    (0, f"{_NEEDLE}内容"),
                ],
            )
            invoke = AsyncMock(return_value=ContradictionList().model_dump())
            with (
                patch("app.services.agent.synthesis_modes._shared.safe_llm_invoke", invoke),
                patch(
                    "app.services.agent.synthesis_modes.content_modes.cross_book_search",
                    AsyncMock(return_value=_search_hit("B")),
                ),
            ):
                result = await run_contradictions(
                    session,
                    uid,
                    _body(min_severity="low"),
                    _uuid(book_id),
                )
        assert result["success"] is False
        assert result["error"]

    @pytest.mark.asyncio
    async def test_summary_report_books_covered_and_focus(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(session, uid, title="Rep", chunks=[])
            data_map = {_uuid(book_id): {"book": {"title": "Rep"}}}
            invoke = AsyncMock(
                return_value=SummaryReportResult(
                    report="R",
                    insights=["i"],
                ).model_dump()
            )
            captured = {}

            async def fake_collect(db, user_id, ids, a, b, c):
                captured["ids"] = ids
                return data_map

            with (
                patch("app.services.agent.synthesis_modes._shared.safe_llm_invoke", invoke),
                patch(
                    "app.services.agent.synthesis_modes.report_mode.batch_collect_reading_data",
                    fake_collect,
                ),
            ):
                result = await run_summary_report(
                    session,
                    uid,
                    _body(book_ids=[_uuid(book_id)], focus="growth", format="narrative"),
                    _uuid(book_id),
                )

        assert result["success"] is True
        assert result["data"]["report"] == "R"
        # camelCase key — the frontend casts the payload raw.
        assert result["data"]["booksCovered"] == 1
        assert captured["ids"] == [_uuid(book_id)]
        human = invoke.await_args.args[0][1].content
        assert "narrative" in human and "growth" in human

    @pytest.mark.asyncio
    async def test_dispatch_unknown_mode_raises(self):
        async with _TestSession() as session:
            with pytest.raises(ValueError):
                await run_synthesis_mode(
                    session,
                    uuid4(),
                    "nope",
                    _body(),
                    uuid4(),
                )


def _uuid(s: str):
    from uuid import UUID as U

    return U(s)


# ---------------------------------------------------------------------------
# Router dispatch + legacy compat
# ---------------------------------------------------------------------------


class TestSynthesisRouterModes:
    @pytest.mark.asyncio
    async def test_mode_body_dispatches_to_agent(self, client):
        reg = await register_user(client)
        book_id = str(uuid4())
        agent = AsyncMock(
            return_value={
                "success": True,
                "data": {"nodes": [], "edges": []},
                "error": None,
            }
        )
        with patch("app.routers.synthesis.run_synthesis_mode", agent):
            resp = await client.post(
                f"/api/v1/synthesis/{book_id}",
                json={"mode": "concept_map", "topic": "ambition", "maxNodes": 20},
                headers=auth_headers(reg["token"]),
            )
        assert resp.status_code == 200
        assert resp.json()["data"]["nodes"] == []
        agent.assert_awaited_once()
        assert agent.await_args.args[2] == "concept_map"

    @pytest.mark.asyncio
    async def test_camel_case_fields_route_without_mode(self, client):
        """The pre-upgrade panel payloads (no mode key) must still route."""
        reg = await register_user(client)
        book_id = str(uuid4())
        agent = AsyncMock(
            return_value={
                "success": True,
                "data": {"references": []},
                "error": None,
            }
        )
        with patch("app.routers.synthesis.run_synthesis_mode", agent):
            resp = await client.post(
                f"/api/v1/synthesis/{book_id}",
                json={"concept": "fate", "sourceBookId": book_id, "analysisType": "all"},
                headers=auth_headers(reg["token"]),
            )
        assert resp.status_code == 200
        assert agent.await_args.args[2] == "cross_reference"

    @pytest.mark.asyncio
    async def test_plain_body_stays_on_legacy_path(self, client):
        from app.schemas.synthesis import SynthesisResponse

        reg = await register_user(client)
        book_id = str(uuid4())
        legacy = AsyncMock(
            return_value=SynthesisResponse(
                success=True,
                data={"themes": [], "connections": []},
            )
        )
        agent = AsyncMock()
        with (
            patch("app.routers.synthesis.synthesize", legacy),
            patch("app.routers.synthesis.run_synthesis_mode", agent),
        ):
            resp = await client.post(
                f"/api/v1/synthesis/{book_id}",
                json={"query": "what changed me"},
                headers=auth_headers(reg["token"]),
            )
        assert resp.status_code == 200
        legacy.assert_awaited_once()
        agent.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_mode_rejected_by_schema(self, client):
        reg = await register_user(client)
        resp = await client.post(
            f"/api/v1/synthesis/{uuid4()}",
            json={"mode": "does_not_exist"},
            headers=auth_headers(reg["token"]),
        )
        assert resp.status_code == 422


class TestSynthesisModeWiring:
    def test_templates_registered(self):
        for key in (
            "synthesis.cross_reference.system",
            "synthesis.cross_reference.human",
            "synthesis.concept_map.system",
            "synthesis.concept_map.human",
            "synthesis.contradictions.system",
            "synthesis.contradictions.human",
            "synthesis.summary_report.system",
            "synthesis.summary_report.human",
        ):
            assert key in ALL_TEMPLATES

    def test_golden_and_mock_wired(self):
        from app.eval.golden_dataset import ALL_GOLDEN
        from app.eval.mock_data import MOCK_RESPONSES, SCHEMA_MAP

        keys = {(g["service"], g["action"]) for g in ALL_GOLDEN}
        for action in ("cross_reference", "concept_map", "contradictions", "summary_report"):
            assert ("synthesis", action) in keys
            assert action in MOCK_RESPONSES["synthesis"]
            assert action in SCHEMA_MAP["synthesis"]
