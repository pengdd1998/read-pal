"""Content-grounded synthesis modes: cross-reference, concept map, contradictions.

All three retrieve through the Research agent's ownership-gated
``cross_book_search`` and ground the LLM in numbered source excerpts.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts import (
    CONCEPT_MAP_HUMAN,
    CONCEPT_MAP_SYSTEM,
    CONTRADICTIONS_HUMAN,
    CONTRADICTIONS_SYSTEM,
    CROSS_REFERENCE_HUMAN,
    CROSS_REFERENCE_SYSTEM,
)
from app.schemas.llm_outputs import (
    ConceptMapResult,
    ContradictionList,
    CrossReferenceResult,
)
from app.schemas.synthesis import SynthesisRequest
from app.services.agent.synthesis_modes._shared import (
    _SEVERITY_ORDER,
    budgeted_sources,
    completed_log,
    invoke,
    load_book,
    load_scoped_titles,
    mark_fallback,
    result,
)
from app.services.rag.cross_book import cross_book_search
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input

_NO_SOURCES = "(no sources found)"


async def run_cross_reference(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Trace one concept from its source book through the whole library."""
    t0 = time.monotonic()
    source = await load_book(db, user_id, book_id)
    if not source:
        return {"success": False, "data": {"error": "Book not found"}, "error": "Book not found"}

    concept = sanitize_user_input(body.concept or "", max_length=300, context="xr_concept")
    analysis_type = body.analysis_type or "all"
    # Library-wide: cross-referencing is the whole point; ownership is
    # gated inside cross_book_search.
    chunks = await cross_book_search(db, user_id, concept)

    data = await invoke(
        [
            SystemMessage(content=CROSS_REFERENCE_SYSTEM.template),
            HumanMessage(
                content=CROSS_REFERENCE_HUMAN.template.format(
                    concept=concept,
                    analysis_type=analysis_type,
                    source_title=sanitize_book_field(source.title, field="title"),
                    source_author=sanitize_book_field(source.author, field="author") or "Unknown",
                    sources=budgeted_sources(chunks, "xr_sources") or _NO_SOURCES,
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
    data, is_fallback = mark_fallback(data, "references")
    completed_log(
        "cross_reference",
        user_id,
        t0,
        references_count=len(data.get("references", [])),
    )
    return result(data, is_fallback)


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

    data = await invoke(
        [
            SystemMessage(content=CONCEPT_MAP_SYSTEM.template),
            HumanMessage(
                content=CONCEPT_MAP_HUMAN.template.format(
                    topic=topic,
                    max_nodes=max_nodes,
                    sources=budgeted_sources(chunks, "cm_sources") or _NO_SOURCES,
                )
            ),
        ],
        ConceptMapResult,
        CONCEPT_MAP_SYSTEM,
        "Synthesis concept map",
        user_id,
    )
    data, is_fallback = mark_fallback(data, "nodes")
    completed_log(
        "concept_map",
        user_id,
        t0,
        nodes_count=len(data.get("nodes", [])),
        edges_count=len(data.get("edges", [])),
    )
    return result(data, is_fallback)


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
        or " ".join(str(b.title) for b in (await load_scoped_titles(db, user_id, scoped_ids))),
        max_length=300,
        context="ctr_query",
    )
    chunks = await cross_book_search(db, user_id, query, book_ids=scoped_ids)
    topic_clause = f' around the topic "{topic}"' if topic else ""

    data = await invoke(
        [
            SystemMessage(content=CONTRADICTIONS_SYSTEM.template),
            HumanMessage(
                content=CONTRADICTIONS_HUMAN.template.format(
                    min_severity=min_severity,
                    topic_clause=topic_clause,
                    sources=budgeted_sources(chunks, "ctr_sources") or _NO_SOURCES,
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
    data, is_fallback = mark_fallback(data, "contradictions")
    completed_log(
        "contradictions",
        user_id,
        t0,
        contradictions_count=len(data.get("contradictions", [])),
    )
    return result(data, is_fallback)
