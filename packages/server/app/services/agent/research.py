"""Phase 2 Research agent — cross-library, citation-grounded Q&A.

Pipeline: sanitize question → cross-book RAG (ownership-gated, spoiler-
safe — ``rag/cross_book.py``) → cited synthesis via ``safe_llm_invoke``.

Non-streaming for the skeleton, matching the cross-book-synthesis shape;
a streaming variant will reuse the ``stream_registry`` cancellation path
when the UI needs progressive rendering.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts import RESEARCH_HUMAN, RESEARCH_SYSTEM
from app.schemas.llm_outputs import ResearchBrief
from app.services.llm import safe_llm_invoke
from app.services.rag.cross_book import cross_book_search
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger("read-pal.research")

# Phase 2 agents run on the default GLM family — same convention as
# memory_book.section_generation. Never-rule #3: no bare TokenBudget().
_RESEARCH_MODEL = "glm-4.7-flash"
_PER_SOURCE_CHAR_CAP = 1200
_SOURCES_CHAR_CAP = 12_000


def _format_sources(chunks: list[dict]) -> str:
    """Number the excerpts so model citations can reference ``source_id``."""
    lines: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        title = sanitize_book_field(chunk.get("book_title"), field="title")
        author = sanitize_book_field(chunk.get("author"), field="author")
        chapter = (chunk.get("title") or "Untitled").strip()
        content = sanitize_user_input(
            chunk.get("content", ""),
            max_length=_PER_SOURCE_CHAR_CAP,
            context="research_source",
        )
        lines.append(f"[{idx}] {title} — {author or 'Unknown'} — Chapter: {chapter}\n{content}")
    return "\n\n".join(lines)[:_SOURCES_CHAR_CAP]


def _source_metadata(chunks: list[dict]) -> list[dict[str, Any]]:
    """Build the citation list returned alongside the brief.

    Source ids are 1-indexed to match ``_format_sources`` and the
    ``source_id`` the model cites in each finding.
    """
    return [
        {
            "source_id": idx,
            "book_id": chunk.get("book_id"),
            "book_title": sanitize_book_field(
                chunk.get("book_title"),
                field="title",
            ),
            "author": sanitize_book_field(chunk.get("author"), field="author"),
            "chapter_title": (chunk.get("title") or "Untitled").strip(),
        }
        for idx, chunk in enumerate(chunks, start=1)
    ]


def _is_research_fallback(data: dict[str, Any]) -> bool:
    """Detect the empty fallback (every field empty)."""
    return not data.get("summary") and not data.get("findings") and not data.get("follow_ups")


async def run_research(
    db: AsyncSession,
    user_id: UUID,
    question: str,
    book_ids: list[UUID] | None = None,
) -> dict[str, Any]:
    """Answer a research question from the user's own library, with citations."""
    t0 = time.monotonic()
    safe_question = sanitize_user_input(
        question,
        max_length=2000,
        context="research_question",
    )
    logger.info(
        "research.started",
        user_id=str(user_id),
        scoped=bool(book_ids),
    )

    chunks = await cross_book_search(db, user_id, safe_question, book_ids=book_ids)

    if not chunks:
        logger.info("research.no_sources", user_id=str(user_id))
        return {
            "success": True,
            "data": {
                "summary": "",
                "findings": [],
                "follow_ups": [],
                "sources": [],
                "books_searched": 0,
            },
        }

    budget = TokenBudget(model=_RESEARCH_MODEL)
    sources_block = budget.add(_format_sources(chunks), "research_sources")
    if budget.truncations:
        logger.warning(
            "research_sources_truncated",
            truncations=", ".join(budget.truncations),
        )

    messages = [
        SystemMessage(content=RESEARCH_SYSTEM.template),
        HumanMessage(
            content=RESEARCH_HUMAN.template.format(
                question=safe_question,
                sources=sources_block,
            )
        ),
    ]
    data = await safe_llm_invoke(
        messages,
        fallback=ResearchBrief().model_dump(),
        log_label="Research agent",
        schema_class=ResearchBrief,
        user_id=str(user_id),
        book_id=None,
        template=RESEARCH_SYSTEM,
    )

    is_fallback = _is_research_fallback(data)
    if is_fallback:
        data["error"] = "AI analysis unavailable - showing partial results"

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        "research.completed",
        user_id=str(user_id),
        findings_count=len(data.get("findings", [])),
        sources_count=len(chunks),
        latency_ms=round(elapsed, 1),
    )
    return {
        "success": not is_fallback,
        "data": {**data, "sources": _source_metadata(chunks)},
        "error": data.get("error") if is_fallback else None,
    }
