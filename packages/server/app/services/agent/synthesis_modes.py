"""Phase 2 Synthesis agent — mode-aware dispatch for the synthesis panel.

The panel's five tabs used to POST mode-specific fields that
``SynthesisRequest`` silently ignored (extra=ignore), so every tab ran
the same generic analysis. This module gives four of the five modes real
backends; ``synthesize`` stays on the pre-existing single-book path.

Content-grounded modes (cross_reference / concept_map / contradictions)
reuse the Research agent's ownership-gated cross-book retrieval; the
summary_report mode reuses the cross-book reading-data collector.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.prompts import (
    CONCEPT_MAP_HUMAN,
    CONCEPT_MAP_SYSTEM,
    CONTRADICTIONS_HUMAN,
    CONTRADICTIONS_SYSTEM,
    CROSS_REFERENCE_HUMAN,
    CROSS_REFERENCE_SYSTEM,
    SUMMARY_REPORT_HUMAN,
    SUMMARY_REPORT_SYSTEM,
)
from app.schemas.llm_outputs import (
    ConceptMapResult,
    ContradictionList,
    CrossReferenceResult,
    SummaryReportResult,
)
from app.schemas.synthesis import SynthesisRequest
from app.services.cross_book_synthesis import batch_collect_reading_data
from app.services.llm import safe_llm_invoke
from app.services.rag.cross_book import cross_book_search
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger("read-pal.synthesis")

_SYNTHESIS_MODEL = "glm-4.7-flash"
_SOURCES_CHAR_CAP = 10_000
_PER_SOURCE_CHAR_CAP = 1200

# Canonical mode names and their UI aliases (SingleBookAnalysisCard sends
# 'contradictions'/'summary'; SynthesisPanel sends 'find_contradictions'/
# 'summary_report'). 'synthesize' maps to None → legacy single-book path.
_MODE_ALIASES: dict[str, str | None] = {
    "cross_reference": "cross_reference",
    "concept_map": "concept_map",
    "find_contradictions": "contradictions",
    "contradictions": "contradictions",
    "summary_report": "summary_report",
    "summary": "summary_report",
    "synthesize": None,
}

_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}


def resolve_synthesis_mode(body: SynthesisRequest | None) -> str | None:
    """Canonical mode for a request body, or None for the legacy path.

    Explicit ``mode`` wins; otherwise the mode-specific fields identify
    the tab (the panel didn't send ``mode`` before this upgrade). Field
    order matches the tabs' distinctive payloads.
    """
    if body is None:
        return None
    if body.mode:
        return _MODE_ALIASES.get(body.mode.strip().lower())
    if body.concept:
        return "cross_reference"
    if body.max_nodes is not None:
        return "concept_map"
    if body.min_severity is not None:
        return "contradictions"
    if body.format is not None or body.focus:
        return "summary_report"
    return None


async def _load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book | None:
    result = await db.execute(select(Book).where(Book.id == book_id, Book.user_id == user_id))
    return result.scalar_one_or_none()


def _format_sources(chunks: list[dict]) -> str:
    """Number excerpts so model items can trace to source_id (Research idiom)."""
    lines: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        title = sanitize_book_field(chunk.get("book_title"), field="title")
        author = sanitize_book_field(chunk.get("author"), field="author")
        chapter = (chunk.get("title") or "Untitled").strip()
        content = sanitize_user_input(
            chunk.get("content", ""),
            max_length=_PER_SOURCE_CHAR_CAP,
            context="synthesis_mode_source",
        )
        lines.append(f"[{idx}] {title} — {author or 'Unknown'} — Chapter: {chapter}\n{content}")
    return "\n\n".join(lines)[:_SOURCES_CHAR_CAP]


def _budgeted_sources(chunks: list[dict], label: str) -> str:
    budget = TokenBudget(model=_SYNTHESIS_MODEL)
    sources = budget.add(_format_sources(chunks), label)
    if budget.truncations:
        logger.warning(
            "synthesis_mode_sources_truncated",
            truncations=", ".join(budget.truncations),
        )
    return sources


def _mark_fallback(data: dict[str, Any], primary_key: str) -> tuple[dict[str, Any], bool]:
    """Shared fallback convention: primary field empty → partial success."""
    if not data.get(primary_key):
        data["error"] = "AI analysis unavailable - showing partial results"
        return data, True
    return data, False


async def _invoke(
    messages: list,
    schema_class: type,
    template,
    label: str,
    user_id: UUID,
) -> dict[str, Any]:
    return await safe_llm_invoke(
        messages,
        fallback=schema_class().model_dump(),
        log_label=label,
        schema_class=schema_class,
        user_id=str(user_id),
        book_id=None,
        template=template,
    )


async def run_cross_reference(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Trace one concept from its source book through the whole library."""
    t0 = time.monotonic()
    source = await _load_book(db, user_id, book_id)
    if not source:
        return {"success": False, "data": {"error": "Book not found"}, "error": "Book not found"}

    concept = sanitize_user_input(body.concept or "", max_length=300, context="xr_concept")
    analysis_type = body.analysis_type or "all"
    # Library-wide: cross-referencing is the whole point; ownership is
    # gated inside cross_book_search.
    chunks = await cross_book_search(db, user_id, concept)

    data = await _invoke(
        [
            SystemMessage(content=CROSS_REFERENCE_SYSTEM.template),
            HumanMessage(
                content=CROSS_REFERENCE_HUMAN.template.format(
                    concept=concept,
                    analysis_type=analysis_type,
                    source_title=sanitize_book_field(source.title, field="title"),
                    source_author=sanitize_book_field(source.author, field="author") or "Unknown",
                    sources=_budgeted_sources(chunks, "xr_sources") or "(no sources found)",
                )
            ),
        ],
        CrossReferenceResult,
        CROSS_REFERENCE_SYSTEM,
        "Synthesis cross-reference",
        user_id,
    )

    refs = data.get("references", [])
    if analysis_type in ("supporting", "contradicting", "extending"):
        data["references"] = [
            r for r in refs if isinstance(r, dict) and r.get("type") == analysis_type
        ]
    data, is_fallback = _mark_fallback(data, "references")
    logger.info(
        "synthesis.cross_reference.completed",
        user_id=str(user_id),
        references_count=len(data.get("references", [])),
        latency_ms=round((time.monotonic() - t0) * 1000, 1),
    )
    return {
        "success": not is_fallback,
        "data": data,
        "error": data.get("error") if is_fallback else None,
    }


async def run_concept_map(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
) -> dict[str, Any]:
    """Topic → nodes/edges graph over library excerpts."""
    t0 = time.monotonic()
    topic = sanitize_user_input(body.topic or "", max_length=300, context="cm_topic")
    max_nodes = body.max_nodes or 20
    chunks = await cross_book_search(
        db,
        user_id,
        topic,
        total_k=min(30, max(10, 2 * max_nodes)),
    )

    data = await _invoke(
        [
            SystemMessage(content=CONCEPT_MAP_SYSTEM.template),
            HumanMessage(
                content=CONCEPT_MAP_HUMAN.template.format(
                    topic=topic,
                    max_nodes=max_nodes,
                    sources=_budgeted_sources(chunks, "cm_sources") or "(no sources found)",
                )
            ),
        ],
        ConceptMapResult,
        CONCEPT_MAP_SYSTEM,
        "Synthesis concept map",
        user_id,
    )
    data, is_fallback = _mark_fallback(data, "nodes")
    logger.info(
        "synthesis.concept_map.completed",
        user_id=str(user_id),
        nodes_count=len(data.get("nodes", [])),
        edges_count=len(data.get("edges", [])),
        latency_ms=round((time.monotonic() - t0) * 1000, 1),
    )
    return {
        "success": not is_fallback,
        "data": data,
        "error": data.get("error") if is_fallback else None,
    }


async def run_contradictions(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Surface real disagreements between the scoped books."""
    t0 = time.monotonic()
    topic = (body.topic or "").strip()
    min_severity = body.min_severity or "medium"
    scoped_ids = body.book_ids or [book_id]
    # Without a topic there is nothing to search for; the scoped books'
    # titles are a reasonable stand-in query (keyword path matches
    # little, semantic carries it).
    query = sanitize_user_input(
        topic
        or " ".join(str(b.title) for b in (await _load_scoped_titles(db, user_id, scoped_ids))),
        max_length=300,
        context="ctr_query",
    )
    chunks = await cross_book_search(db, user_id, query, book_ids=scoped_ids)
    topic_clause = f' around the topic "{topic}"' if topic else ""

    data = await _invoke(
        [
            SystemMessage(content=CONTRADICTIONS_SYSTEM.template),
            HumanMessage(
                content=CONTRADICTIONS_HUMAN.template.format(
                    min_severity=min_severity,
                    topic_clause=topic_clause,
                    sources=_budgeted_sources(chunks, "ctr_sources") or "(no sources found)",
                )
            ),
        ],
        ContradictionList,
        CONTRADICTIONS_SYSTEM,
        "Synthesis contradictions",
        user_id,
    )
    floor = _SEVERITY_ORDER.get(min_severity, 1)
    data["contradictions"] = [
        c
        for c in data.get("contradictions", [])
        if isinstance(c, dict) and _SEVERITY_ORDER.get(c.get("severity", "medium"), 1) >= floor
    ]
    data, is_fallback = _mark_fallback(data, "contradictions")
    logger.info(
        "synthesis.contradictions.completed",
        user_id=str(user_id),
        contradictions_count=len(data.get("contradictions", [])),
        latency_ms=round((time.monotonic() - t0) * 1000, 1),
    )
    return {
        "success": not is_fallback,
        "data": data,
        "error": data.get("error") if is_fallback else None,
    }


async def _load_scoped_titles(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> list[Book]:
    result = await db.execute(select(Book).where(Book.user_id == user_id, Book.id.in_(book_ids)))
    return list(result.scalars().all())


async def run_summary_report(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Cross-book reading-data report (focus + format aware)."""
    import json

    t0 = time.monotonic()
    scoped_ids = body.book_ids or [book_id]
    data_map = await batch_collect_reading_data(db, user_id, scoped_ids, True, True, False)
    all_book_data = [data_map[bid] for bid in scoped_ids if bid in data_map]

    if not all_book_data:
        return {
            "success": False,
            "data": {"error": "No readable books"},
            "error": "No readable books",
        }

    focus = (body.focus or "").strip()
    focus_clause = (
        f' focused on "{sanitize_user_input(focus, max_length=300, context="sr_focus")}"'
        if focus
        else ""
    )

    budget = TokenBudget(model=_SYNTHESIS_MODEL)
    budgeted = budget.add(json.dumps(all_book_data, default=str), "sr_data")
    if budget.truncations:
        logger.warning(
            "summary_report_data_truncated",
            truncations=", ".join(budget.truncations),
        )

    data = await _invoke(
        [
            SystemMessage(content=SUMMARY_REPORT_SYSTEM.template),
            HumanMessage(
                content=SUMMARY_REPORT_HUMAN.template.format(
                    report_format=body.format or "structured",
                    focus_clause=focus_clause,
                    data=budgeted,
                )
            ),
        ],
        SummaryReportResult,
        SUMMARY_REPORT_SYSTEM,
        "Synthesis summary report",
        user_id,
    )
    data, is_fallback = _mark_fallback(data, "report")
    # booksCovered is camelCase in the frontend contract (raw cast, no
    # mapping) — set it explicitly rather than relying on model_dump.
    data["booksCovered"] = len(all_book_data)
    logger.info(
        "synthesis.summary_report.completed",
        user_id=str(user_id),
        books_covered=len(all_book_data),
        latency_ms=round((time.monotonic() - t0) * 1000, 1),
    )
    return {
        "success": not is_fallback,
        "data": data,
        "error": data.get("error") if is_fallback else None,
    }


async def run_synthesis_mode(
    db: AsyncSession,
    user_id: UUID,
    mode: str,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Dispatch one canonical mode. Unknown modes raise ValueError."""
    handlers = {
        "cross_reference": run_cross_reference,
        "concept_map": run_concept_map,
        "contradictions": run_contradictions,
        "summary_report": run_summary_report,
    }
    handler = handlers.get(mode)
    if handler is None:
        raise ValueError(f"unknown synthesis mode: {mode}")
    return await handler(db, user_id, body, book_id)
