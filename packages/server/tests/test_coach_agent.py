"""Phase 2 Coach agent tests.

Layers mirror tests/test_research_agent.py: ownership gating, signal
collection, excerpt spoiler scoping, orchestration with a mocked
``safe_llm_invoke``, router contract, and prompt/eval wiring.
"""

from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest

from app.prompts import ALL_TEMPLATES, COACH_ASSESSMENT_HUMAN, COACH_ASSESSMENT_SYSTEM
from app.schemas.llm_outputs import CoachReport
from app.services.agent.coach import run_coach_report
from tests.conftest import _TestSession, auth_headers, register_user
from tests.test_research_agent import _NEEDLE, _seed_book, _seed_user


def _populated_report() -> dict:
    return {
        "session_summary": "Steady pace across six sessions.",
        "focus_areas": [
            {
                "area": "Narrator reliability",
                "reason": "Skepticism in ch.4",
                "priority": "high",
            }
        ],
        "probes": [
            {
                "question": "Why does Nick doubt Gatsby?",
                "hint": "Delivery of details.",
                "answer": "Too polished to be true.",
                "chapter_title": "Chapter 4",
            }
        ],
        "study_tips": ["Re-read the last two pages aloud."],
    }


def _seed_sessions(session, uid, book_id: str, count: int, duration=600, pages=10):
    from app.models.reading_session import ReadingSession

    for i in range(count):
        session.add(
            ReadingSession(
                user_id=uid,
                book_id=UUID(book_id),
                duration=duration,
                pages_read=pages,
                is_active=False,
            )
        )
    # ReadingSession.started_at has a default; nothing else to set.


class TestCoachSignalsAndExcerpts:
    @pytest.mark.asyncio
    async def test_foreign_or_missing_book_raises_value_error(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            other = await _seed_user(session)
            foreign = await _seed_book(
                session,
                other,
                title="Theirs",
                chunks=[
                    (0, f"{_NEEDLE}内容"),
                ],
            )
            with pytest.raises(ValueError):
                await run_coach_report(session, uid, UUID(foreign))
            with pytest.raises(ValueError):
                await run_coach_report(session, uid, uuid4())

    @pytest.mark.asyncio
    async def test_signals_ride_along_with_report(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="Coached",
                chunks=[
                    (0, f"{_NEEDLE}第一章内容"),
                ],
            )
            _seed_sessions(session, uid, book_id, count=3, duration=600, pages=12)
            await session.commit()

            invoke = AsyncMock(return_value=_populated_report())
            with patch("app.services.agent.coach.safe_llm_invoke", invoke):
                result = await run_coach_report(session, uid, UUID(book_id))

        assert result["success"] is True
        signals = result["data"]["signals"]
        assert signals["session_count"] == 3
        assert signals["total_minutes"] == 30  # 3 × 600s
        assert signals["total_pages_read"] == 36
        assert result["data"]["probes"][0]["chapter_title"] == "Chapter 4"

        invoke.assert_awaited_once()
        kwargs = invoke.await_args.kwargs
        assert kwargs["log_label"] == "Coach agent"
        assert kwargs["template"] is COACH_ASSESSMENT_SYSTEM
        assert kwargs["book_id"] == book_id

    @pytest.mark.asyncio
    async def test_book_without_sessions_still_assesses(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="Fresh",
                chunks=[
                    (0, f"{_NEEDLE}开篇"),
                ],
            )
            invoke = AsyncMock(return_value=_populated_report())
            with patch("app.services.agent.coach.safe_llm_invoke", invoke):
                result = await run_coach_report(session, uid, UUID(book_id))

        assert result["success"] is True
        assert result["data"]["signals"]["session_count"] == 0

    @pytest.mark.asyncio
    async def test_empty_llm_result_is_reported_as_partial(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="Coached",
                chunks=[
                    (0, f"{_NEEDLE}内容"),
                ],
            )
            invoke = AsyncMock(return_value=CoachReport().model_dump())
            with patch("app.services.agent.coach.safe_llm_invoke", invoke):
                result = await run_coach_report(session, uid, UUID(book_id))

        assert result["success"] is False
        assert result["error"]
        assert result["data"]["signals"]["session_count"] == 0


class TestCoachRouter:
    @pytest.mark.asyncio
    async def test_endpoint_delegates_to_service(self, client):
        reg = await register_user(client)
        service = AsyncMock(
            return_value={
                "success": True,
                "data": {
                    "session_summary": "s",
                    "focus_areas": [],
                    "probes": [],
                    "study_tips": [],
                    "signals": {},
                },
                "error": None,
            }
        )
        book_id = str(uuid4())
        with patch("app.routers.agent.run_coach_report", service):
            resp = await client.post(
                "/api/v1/agent/coach",
                json={"bookId": book_id},
                headers=auth_headers(reg["token"]),
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["session_summary"] == "s"
        service.assert_awaited_once()
        assert service.await_args.args[2] == UUID(book_id)

    @pytest.mark.asyncio
    async def test_endpoint_maps_missing_book_to_404(self, client):
        reg = await register_user(client)
        service = AsyncMock(side_effect=ValueError("book not found"))
        with patch("app.routers.agent.run_coach_report", service):
            resp = await client.post(
                "/api/v1/agent/coach",
                json={"bookId": str(uuid4())},
                headers=auth_headers(reg["token"]),
            )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_endpoint_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/agent/coach",
            json={"bookId": str(uuid4())},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_real_flow_over_http_with_mocked_llm(self, client):
        """Registered user + API-created book, LLM mocked at the service's
        import point — exercises ownership load + signals over HTTP."""
        reg = await register_user(client)
        create = await client.post(
            "/api/v1/books",
            json={
                "title": "Coached Over HTTP",
                "author": "A",
                "file_type": "epub",
                "file_size": 1,
                "total_pages": 10,
            },
            headers=auth_headers(reg["token"]),
        )
        book_id = create.json()["data"]["id"]
        with patch(
            "app.services.agent.coach.safe_llm_invoke",
            AsyncMock(return_value=_populated_report()),
        ):
            resp = await client.post(
                "/api/v1/agent/coach",
                json={"bookId": book_id},
                headers=auth_headers(reg["token"]),
            )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["session_summary"]
        assert data["signals"]["session_count"] == 0


class TestCoachWiring:
    def test_templates_registered(self):
        assert ALL_TEMPLATES["coach.assessment.system"] is COACH_ASSESSMENT_SYSTEM
        assert ALL_TEMPLATES["coach.assessment.human"] is COACH_ASSESSMENT_HUMAN
        assert COACH_ASSESSMENT_SYSTEM.version == 1
        assert COACH_ASSESSMENT_SYSTEM.output_format == "json"
        assert set(COACH_ASSESSMENT_HUMAN.variables) == {
            "title",
            "author",
            "progress",
            "signals",
            "recent_content",
        }

    def test_golden_and_mock_wired(self):
        from app.eval.golden_dataset import ALL_GOLDEN
        from app.eval.mock_data import MOCK_RESPONSES, SCHEMA_MAP

        keys = {(g["service"], g["action"]) for g in ALL_GOLDEN}
        assert ("coach_agent", "assess") in keys
        assert SCHEMA_MAP["coach_agent"]["assess"] is CoachReport
        assert "assess" in MOCK_RESPONSES["coach_agent"]
