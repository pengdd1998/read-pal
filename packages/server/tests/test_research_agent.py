"""Phase 2 Research agent tests.

Layers:
- ``cross_book_search``: ownership gating, spoiler limit, attribution.
- ``run_research``: orchestration (sources → cited brief), LLM fallback
  detection, empty-library short-circuit.
- Router: thin-endpoint contract over HTTP (auth, camelCase, idempotency
  path delegates to the service).
- Wiring: prompts registered, golden eval entry present.

Keyword retrieval drives the assertions — the semantic path returns []
in tests (no embedding API key), so ``hybrid_chunk_search`` degenerates
to the keyword list, which is deterministic on the seeded needle.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.prompts import ALL_TEMPLATES, RESEARCH_HUMAN, RESEARCH_SYSTEM
from app.schemas.llm_outputs import ResearchBrief
from app.services.agent.research import run_research
from app.services.rag.cross_book import cross_book_search
from tests.conftest import _TestSession, auth_headers, register_user

# Filler shares no tokens with the needle (mirrors test_p32_hybrid_rag)
# so keyword pre-filtering can't pull fillers into the candidate window.
_NEEDLE = "唯一研究词xyz"
_FILLER = "第{i}段与问题无关的正文内容"


@pytest.fixture(autouse=True)
def _no_embeddings(monkeypatch):
    """Keep retrieval tests hermetic: no embedding API, keyword path only.

    ``_get_embedding`` would otherwise hit the real GLM endpoint (dev
    .env has a live key) and burn ~2s per call in 429 retries; the
    semantic path is irrelevant to these assertions — it degrades to []
    and RRF falls back to keyword order.
    """
    monkeypatch.setattr(
        "app.services.rag.search._get_embedding",
        AsyncMock(return_value=None),
    )


async def _seed_user(session) -> str:
    uid = uuid4()
    # PG enforces FKs — insert the owner row before books.
    await session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, name, created_at, updated_at) "
            "VALUES (:u, :e, 'h', 'S', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ),
        {"u": uid, "e": f"{uid}@research-test"},
    )
    return uid


async def _seed_book(
    session,
    uid,
    *,
    title,
    chunks,
    status="completed",
    current_segment=None,
) -> str:
    """Seed one book + document + chunks; returns the book id (str UUID)."""
    from app.models.book import Book, BookFileType
    from app.models.document import Document
    from app.models.book_chunk import BookChunk

    book_id = uuid4()
    doc_id = uuid4()
    session.add(
        Book(
            id=book_id,
            user_id=uid,
            title=title,
            author="Author",
            file_type=BookFileType.epub,
            file_size=1,
            total_pages=100,
            status=status,
            current_segment=current_segment or 0,
        )
    )
    session.add(
        Document(
            id=doc_id,
            book_id=book_id,
            user_id=uid,
            content="x",
            chapters=[],
        )
    )
    await session.flush()
    session.add_all(
        [
            BookChunk(
                book_id=book_id,
                document_id=doc_id,
                chapter_index=chapter_index,
                chunk_index=0,
                content=content,
            )
            for chapter_index, content in chunks
        ]
    )
    await session.commit()
    return str(book_id)


def _populated_brief() -> dict:
    return {
        "summary": "Both books frame the question through decay.",
        "findings": [
            {
                "claim": "Source 1 states the thesis directly.",
                "evidence": f'"{_NEEDLE} carries the key sentence."',
                "source_id": 1,
                "book_title": "Book One",
                "chapter_title": "Chapter 1",
            }
        ],
        "follow_ups": ["How does Book Two complicate this?"],
    }


# ---------------------------------------------------------------------------
# cross_book_search — gating, spoilers, attribution
# ---------------------------------------------------------------------------


class TestCrossBookSearch:
    @pytest.mark.asyncio
    async def test_results_carry_book_attribution(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_a = await _seed_book(
                session,
                uid,
                title="Book One",
                chunks=[
                    (0, _FILLER.format(i=0)),
                    (1, f"{_NEEDLE}出现在第一本书"),
                ],
            )
            book_b = await _seed_book(
                session,
                uid,
                title="Book Two",
                chunks=[
                    (0, f"{_NEEDLE}也出现在第二本书"),
                ],
            )
            results = await cross_book_search(session, uid, _NEEDLE)

        assert results, "needle chunks in both books must be retrieved"
        titles = {r["book_title"] for r in results}
        assert titles == {"Book One", "Book Two"}
        ids = {r["book_id"] for r in results}
        assert ids == {book_a, book_b}
        assert all(r["author"] == "Author" for r in results)

    @pytest.mark.asyncio
    async def test_foreign_books_are_never_searched(self):
        async with _TestSession() as session:
            uid_a = await _seed_user(session)
            uid_b = await _seed_user(session)
            mine = await _seed_book(
                session,
                uid_a,
                title="Mine",
                chunks=[
                    (0, f"{_NEEDLE}我的书"),
                ],
            )
            foreign = await _seed_book(
                session,
                uid_b,
                title="Theirs",
                chunks=[
                    (0, f"{_NEEDLE}别人的书"),
                ],
            )
            # Even an explicit scope request cannot widen ownership: the
            # foreign id drops out, the owned id stays.
            from uuid import UUID

            results = await cross_book_search(
                session,
                uid_a,
                _NEEDLE,
                book_ids=[UUID(foreign), UUID(mine)],
            )

        assert len(results) == 1
        assert results[0]["book_title"] == "Mine"

    @pytest.mark.asyncio
    async def test_spoiler_limit_applies_per_book(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            # In-progress: reader is at chapter 2 (0-indexed segment).
            await _seed_book(
                session,
                uid,
                title="Reading Now",
                chunks=[
                    (1, f"{_NEEDLE}已读章节命中"),
                    (5, f"{_NEEDLE}未读章节不得命中"),
                ],
                status="reading",
                current_segment=2,
            )
            # Completed: no chapter filter.
            await _seed_book(
                session,
                uid,
                title="Done",
                chunks=[
                    (5, f"{_NEEDLE}完结书后章命中"),
                ],
                status="completed",
            )
            results = await cross_book_search(session, uid, _NEEDLE)

        by_book = {r["book_title"]: r for r in results}
        assert "Reading Now" in by_book
        assert "已读章节命中" in by_book["Reading Now"]["content"]
        assert all("未读章节" not in r["content"] for r in results), (
            "future chapters of an in-progress book must stay invisible"
        )
        assert "Done" in by_book

    @pytest.mark.asyncio
    async def test_user_without_books_gets_empty_results(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            results = await cross_book_search(session, uid, _NEEDLE)
        assert results == []

    @pytest.mark.asyncio
    async def test_completed_book_has_no_chapter_filter(self):
        """P3.5 regression: completed books must not be spoiler-limited.

        ``Book.status`` loads as a ``BookStatus`` member; the historical
        ``== 'completed'`` string check was always False, so a completed
        book stayed capped at current_segment. Seeds a completed book
        whose needle sits far past current_segment.
        """
        from app.services.rag.context import _fetch_book_and_spoiler_limit
        from uuid import UUID as _UUID

        async with _TestSession() as session:
            uid = await _seed_user(session)
            book_id = await _seed_book(
                session,
                uid,
                title="Done Early",
                chunks=[
                    (9, f"{_NEEDLE}完结后的远章"),
                ],
                status="completed",
                current_segment=1,
            )

            _book, limit = await _fetch_book_and_spoiler_limit(
                session,
                uid,
                _UUID(book_id),
            )
            assert limit is None, "completed book must bypass the filter"

            results = await cross_book_search(
                session,
                uid,
                _NEEDLE,
            )
        assert len(results) == 1
        assert "完结后的远章" in results[0]["content"]


# ---------------------------------------------------------------------------
# run_research — orchestration
# ---------------------------------------------------------------------------


class TestRunResearch:
    @pytest.mark.asyncio
    async def test_happy_path_merges_sources_with_brief(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session,
                uid,
                title="Book One",
                chunks=[
                    (0, f"{_NEEDLE}核心段落"),
                ],
            )
            invoke = AsyncMock(return_value=_populated_brief())
            with patch(
                "app.services.agent.research.safe_llm_invoke",
                invoke,
            ):
                result = await run_research(session, uid, f"研究问题 {_NEEDLE}")

        assert result["success"] is True
        data = result["data"]
        assert data["summary"]
        assert data["findings"][0]["source_id"] == 1
        assert data["sources"], "citation metadata must accompany the brief"
        assert data["sources"][0]["book_title"] == "Book One"
        assert data["sources"][0]["source_id"] == 1

        invoke.assert_awaited_once()
        kwargs = invoke.await_args.kwargs
        assert kwargs["log_label"] == "Research agent"
        assert kwargs["template"] is RESEARCH_SYSTEM
        assert kwargs["schema_class"] is ResearchBrief

    @pytest.mark.asyncio
    async def test_empty_llm_result_is_reported_as_partial(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session,
                uid,
                title="Book One",
                chunks=[
                    (0, f"{_NEEDLE}核心段落"),
                ],
            )
            invoke = AsyncMock(return_value=ResearchBrief().model_dump())
            with patch(
                "app.services.agent.research.safe_llm_invoke",
                invoke,
            ):
                result = await run_research(session, uid, f"研究问题 {_NEEDLE}")

        assert result["success"] is False
        assert result["error"]
        # Sources still flow through so the UI can show raw excerpts.
        assert result["data"]["sources"]

    @pytest.mark.asyncio
    async def test_no_sources_short_circuits_without_llm_call(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            invoke = AsyncMock()
            with patch(
                "app.services.agent.research.safe_llm_invoke",
                invoke,
            ):
                result = await run_research(session, uid, "任何问题")

        assert result["success"] is True
        assert result["data"]["findings"] == []
        assert result["data"]["sources"] == []
        invoke.assert_not_awaited()


# ---------------------------------------------------------------------------
# Router — thin endpoint contract
# ---------------------------------------------------------------------------


class TestResearchRouter:
    @pytest.mark.asyncio
    async def test_endpoint_delegates_to_service(self, client):
        reg = await register_user(client)
        service = AsyncMock(
            return_value={
                "success": True,
                "data": {"summary": "s", "findings": [], "follow_ups": [], "sources": []},
                "error": None,
            }
        )
        with patch("app.routers.agent.run_research", service):
            resp = await client.post(
                "/api/v1/agent/research",
                json={"question": "What connects these books?"},
                headers=auth_headers(reg["token"]),
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["summary"] == "s"
        service.assert_awaited_once()
        assert service.await_args.kwargs["book_ids"] is None

    @pytest.mark.asyncio
    async def test_endpoint_accepts_camel_case_scope(self, client):
        reg = await register_user(client)
        service = AsyncMock(
            return_value={
                "success": True,
                "data": {"summary": "", "sources": []},
                "error": None,
            }
        )
        book_id = str(uuid4())
        with patch("app.routers.agent.run_research", service):
            resp = await client.post(
                "/api/v1/agent/research",
                json={"question": "q", "bookIds": [book_id]},
                headers=auth_headers(reg["token"]),
            )

        assert resp.status_code == 200
        scoped = service.await_args.kwargs["book_ids"]
        assert [str(b) for b in scoped] == [book_id]

    @pytest.mark.asyncio
    async def test_endpoint_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/agent/research",
            json={"question": "q"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_empty_library_returns_empty_brief_over_http(self, client):
        reg = await register_user(client)
        resp = await client.post(
            "/api/v1/agent/research",
            json={"question": "What connects these books?"},
            headers=auth_headers(reg["token"]),
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["findings"] == []
        assert data["sources"] == []
        assert data["books_searched"] == 0


# ---------------------------------------------------------------------------
# Wiring — prompt registry + eval dataset
# ---------------------------------------------------------------------------


class TestResearchWiring:
    def test_templates_registered_in_global_registry(self):
        assert ALL_TEMPLATES["research.synthesis.system"] is RESEARCH_SYSTEM
        assert ALL_TEMPLATES["research.synthesis.human"] is RESEARCH_HUMAN
        assert RESEARCH_SYSTEM.version == 1
        assert RESEARCH_SYSTEM.output_format == "json"
        assert RESEARCH_HUMAN.variables == ["question", "sources"]

    def test_human_template_renders_question_and_sources(self):
        rendered = RESEARCH_HUMAN.template.format(
            question="Q",
            sources="[1] S",
        )
        assert "Q" in rendered and "[1] S" in rendered

    def test_golden_and_mock_wired(self):
        from app.eval.golden_dataset import ALL_GOLDEN
        from app.eval.mock_data import MOCK_RESPONSES, SCHEMA_MAP

        keys = {(g["service"], g["action"]) for g in ALL_GOLDEN}
        assert ("research_agent", "synthesize") in keys
        assert SCHEMA_MAP["research_agent"]["synthesize"] is ResearchBrief
        assert "synthesize" in MOCK_RESPONSES["research_agent"]
