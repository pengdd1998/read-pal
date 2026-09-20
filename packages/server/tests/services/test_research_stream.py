"""Phase 2 Research agent SSE streaming tests (matrix J2).

Layers:
- ``research_sse_stream``: frame sequence (request_id → searching →
  sources → synthesizing → brief → [DONE]), empty-library short-circuit,
  fallback-error flag, cooperative cancellation after retrieval.
- Keepalive wrapper: emits ``: keepalive`` comments while synthesis
  stalls, WITHOUT cancelling the underlying RAG/LLM await (the
  ``wait_for`` variant aborted the suspended call — see module docstring).
- Router: auth gate + SSE content type on the stream endpoint.

Keyword retrieval drives the seeded assertions — the semantic path
degenerates to [] without an embedding key (same convention as
test_research_agent.py).
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest

import app.services.agent.research_stream as rs
from app.services.agent.research_stream import research_sse_stream
from tests.conftest import _TestSession, auth_headers, register_user
from tests.fixtures.seeds import _NEEDLE, _seed_book, _seed_user

_FILLER = "第{i}段与问题无关的正文内容"


def _populated_brief() -> dict:
    return {
        "summary": "Both books frame the question through solitude.",
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


async def _collect(agen) -> list[str]:
    return [chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk async for chunk in agen]


def _data_frames(chunks: list[str]) -> list[dict]:
    frames = []
    for chunk in chunks:
        for line in chunk.split("\n"):
            if line.startswith("data: ") and line != "data: [DONE]":
                frames.append(json.loads(line[6:]))
    return frames


@pytest.fixture(autouse=True)
def _hermetic_stream_deps(monkeypatch):
    """No embedding API, no Redis bulkhead state, no cross-worker pub/sub.

    ``register_stream`` is swapped for a bare Event so the real one's
    Redis cancel-listener task doesn't crash-log under the hermetic
    client (harmless but noisy); the cancel test installs its own.
    """
    monkeypatch.setattr(
        "app.services.rag.search.get_embeddings",
        AsyncMock(return_value=[None]),
    )
    monkeypatch.setattr(rs, "register_stream", lambda _rid: asyncio.Event())
    monkeypatch.setattr(rs, "acquire_stream_slot", AsyncMock(return_value=True))
    monkeypatch.setattr(rs, "release_stream_slot", AsyncMock(return_value=None))
    monkeypatch.setattr(rs, "register_stream_cross_worker", AsyncMock(return_value=None))
    monkeypatch.setattr(rs, "release_stream_cross_worker", AsyncMock(return_value=None))


# ---------------------------------------------------------------------------
# research_sse_stream — frame contract
# ---------------------------------------------------------------------------


class TestResearchSseStream:
    @pytest.mark.asyncio
    async def test_frame_sequence_happy_path(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Book One",
                chunks=[(0, f"{_NEEDLE}核心段落")],
            )
            synth = AsyncMock(return_value=_populated_brief())
            with patch.object(rs, "_synthesize_brief", synth):
                chunks = await _collect(
                    research_sse_stream(session, uid, f"研究问题 {_NEEDLE}", request_id="req1")
                )

        assert chunks[-1] == "data: [DONE]\n\n"
        frames = _data_frames(chunks)
        kinds = [
            f.get("request_id") and "request_id"
            or f.get("phase")
            or (f.get("brief") is not None and "brief")
            for f in frames
        ]
        assert kinds == ["request_id", "searching", "sources", "synthesizing", "brief"]

        first, sources_frame, brief_frame = frames[0], frames[2], frames[4]
        brief = brief_frame["brief"]
        assert first["request_id"] == "req1"
        assert sources_frame["sources"], "citations must land before synthesis starts"
        assert sources_frame["books_searched"] == 1
        assert brief["summary"].startswith("Both books")
        assert brief["sources"][0]["book_title"] == "Book One"
        assert brief["books_searched"] == 1
        synth.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_no_sources_short_circuits_without_llm_call(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            synth = AsyncMock()
            with patch.object(rs, "_synthesize_brief", synth):
                chunks = await _collect(
                    research_sse_stream(session, uid, "任何问题", request_id="req2")
                )

        frames = _data_frames(chunks)
        assert chunks[-1] == "data: [DONE]\n\n"
        assert len(frames) == 3, "request_id + searching + empty brief only"
        assert frames[2]["brief"]["books_searched"] == 0
        assert frames[2]["brief"]["sources"] == []
        synth.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unread_only_library_streams_no_progress_flag(self):
        from tests.fixtures.seeds import _NEEDLE as NEEDLE

        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Never Opened",
                chunks=[(0, f"{NEEDLE}扉页")],
                status="unread", current_page=0,
            )
            chunks = await _collect(
                research_sse_stream(session, uid, f"研究问题 {NEEDLE}", request_id="req-np")
            )

        frames = _data_frames(chunks)
        assert len(frames) == 3
        assert frames[2]["brief"].get("no_progress") is True

    @pytest.mark.asyncio
    async def test_fallback_brief_carries_error_flag(self):
        from app.schemas.llm_outputs import ResearchBrief

        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Book One",
                chunks=[(0, f"{_NEEDLE}核心段落")],
            )
            with patch.object(
                rs, "_synthesize_brief", AsyncMock(return_value=ResearchBrief().model_dump())
            ):
                chunks = await _collect(
                    research_sse_stream(session, uid, f"研究问题 {_NEEDLE}", request_id="req3")
                )

        brief_frame = _data_frames(chunks)[-1]
        assert brief_frame["brief"]["error"], "empty synthesis must flag degradation"
        assert brief_frame["brief"]["sources"], "citations still flow on fallback"

    @pytest.mark.asyncio
    async def test_cancel_after_search_emits_cancelled_and_skips_llm(self, monkeypatch):
        cancelled = asyncio.Event()
        monkeypatch.setattr(rs, "register_stream", lambda _rid: cancelled)

        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Book One",
                chunks=[(0, f"{_NEEDLE}核心段落")],
            )

            async def _search_then_cancel(*args, **kwargs):
                # Simulates POST /chat/cancel landing between retrieval and
                # synthesis.
                cancelled.set()
                from app.services.rag.cross_book import cross_book_search

                return await cross_book_search(*args, **kwargs)

            synth = AsyncMock()
            with patch.object(rs, "cross_book_search", _search_then_cancel), \
                    patch.object(rs, "_synthesize_brief", synth):
                chunks = await _collect(
                    research_sse_stream(session, uid, f"研究问题 {_NEEDLE}", request_id="req4")
                )

        frames = _data_frames(chunks)
        assert frames[-1] == {"cancelled": True}
        assert chunks[-1] == "data: [DONE]\n\n"
        synth.assert_not_awaited()


# ---------------------------------------------------------------------------
# keepalive wrapper
# ---------------------------------------------------------------------------


class TestKeepalive:
    @pytest.mark.asyncio
    async def test_keepalive_emitted_while_synthesis_stalls(self, monkeypatch):
        monkeypatch.setattr(rs, "_KEEPALIVE_SECONDS", 0.01)

        async def _slow_synthesis(*args, **kwargs):
            await asyncio.sleep(0.08)
            return _populated_brief()

        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Book One",
                chunks=[(0, f"{_NEEDLE}核心段落")],
            )
            with patch.object(rs, "_synthesize_brief", _slow_synthesis):
                chunks = await _collect(
                    research_sse_stream(session, uid, f"研究问题 {_NEEDLE}", request_id="req5")
                )

        keepalives = [c for c in chunks if c == ": keepalive\n\n"]
        assert len(keepalives) >= 2, "stalled synthesis must produce keepalive comments"
        # The stalled call survived the timeouts and still delivered the brief.
        frames = _data_frames(chunks)
        assert frames[-1]["brief"]["summary"].startswith("Both books")

    @pytest.mark.asyncio
    async def test_fast_stream_emits_no_keepalive(self):
        async with _TestSession() as session:
            uid = await _seed_user(session)
            await _seed_book(
                session, uid, title="Book One",
                chunks=[(0, f"{_NEEDLE}核心段落")],
            )
            with patch.object(rs, "_synthesize_brief", AsyncMock(return_value=_populated_brief())):
                chunks = await _collect(
                    research_sse_stream(session, uid, f"研究问题 {_NEEDLE}", request_id="req6")
                )

        assert not [c for c in chunks if c == ": keepalive\n\n"]


# ---------------------------------------------------------------------------
# Router — thin endpoint contract
# ---------------------------------------------------------------------------


class TestResearchStreamRouter:
    @pytest.mark.asyncio
    async def test_stream_endpoint_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/agent/research/stream",
            json={"question": "q"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_stream_endpoint_returns_sse_frames(self, client):
        reg = await register_user(client)

        async def _fake_stream(*args, **kwargs):
            yield b'data: {"request_id": "r-1"}\n\n'
            yield b"data: [DONE]\n\n"

        with patch("app.services.agent.research_stream.research_sse_stream", _fake_stream):
            resp = await client.post(
                "/api/v1/agent/research/stream",
                json={"question": "What connects these books?"},
                headers=auth_headers(reg["token"]),
            )

        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        assert 'data: {"request_id": "r-1"}' in resp.text
