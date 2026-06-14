"""Knowledge graph service -- NetworkX-based concept extraction and graph building.

This package decomposes the original monolithic ``knowledge_service.py`` into
focused sub-modules while preserving the exact same public API via re-exports.

Sub-modules:
    _cache        Redis key helpers, load/persist
    _extraction   LLM + rule-based concept extraction
    _graph        NetworkX construction + freshness
    _gaps         Knowledge gap detection
    _cross_book   Cross-book theme detection
    _loading      Annotation data loading
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.knowledge import (
    ConceptSearchResult,
    GraphData,
)

from app.services.knowledge._cache import (
    GRAPH_KEY_PREFIX,
    _content_hash,
    _knowledge_cache_ttl,
    _load_cached_graph,
    _persist_graph,
)
from app.services.knowledge._cross_book import get_cross_book_themes
from app.services.knowledge._extraction import (
    _extract_concepts_from_keywords,
    _extract_concepts_via_llm,
)
from app.services.knowledge._gaps import detect_gaps
from app.services.knowledge._graph import (
    _build_nx_graph,
    _compute_freshness,
    _graph_to_data,
)
from app.services.knowledge._loading import _load_annotations

logger = structlog.get_logger('read-pal.knowledge')

__all__ = [
    # Public API functions
    'build_graph',
    'detect_gaps',
    'get_all_cached_graphs',
    'get_concepts',
    'get_cross_book_themes',
    'search_concepts',
    # Cache helpers (used by router + seed_service)
    '_load_cached_graph',
    '_content_hash',
    '_load_annotations',
    'GRAPH_KEY_PREFIX',
    '_knowledge_cache_ttl',
]


# ---------------------------------------------------------------------------
# Helpers for build_graph
# ---------------------------------------------------------------------------


async def _try_load_cached(
    user_id: UUID,
    book_id: UUID,
    current_hash: str,
    force_rebuild: bool,
    annotation_count: int,
) -> GraphData | None:
    """Attempt to load a cached graph, returning None on miss or forced rebuild."""
    if force_rebuild:
        logger.info(
            'knowledge.build_graph.cache_miss',
            force_rebuild=True,
            annotation_count=annotation_count,
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return None

    cached = await _load_cached_graph(user_id, book_id, current_hash)
    if cached is not None:
        logger.info(
            'knowledge.build_graph.cache_hit',
            annotation_count=annotation_count,
            node_count=len(cached.nodes),
            edge_count=len(cached.edges),
            user_id=str(user_id),
            book_id=str(book_id),
        )
    return cached


async def _extract_and_build_graph(
    texts: list[str],
    annotations: list,
    user_id: UUID,
    book_id: UUID,
) -> GraphData:
    """Extract concepts via LLM (with rule-based fallback) and build the graph."""
    concepts = await _extract_concepts_via_llm(texts, user_id=user_id, book_id=book_id)

    if not concepts:
        concepts = _extract_concepts_from_keywords(texts)

    freshness_map: dict[str, float] = {}
    for concept in concepts:
        cname = concept.get('name', '').strip()
        if cname:
            freshness_map[cname] = _compute_freshness(annotations, cname)

    graph = _build_nx_graph(concepts, book_id=book_id, freshness_map=freshness_map)
    return _graph_to_data(graph)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def build_graph(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    force_rebuild: bool = False,
) -> GraphData:
    """Build (or load from cache) a knowledge graph for a user's annotations."""
    t0 = time.monotonic()
    logger.info(
        'knowledge.build_graph.started',
        force_rebuild=force_rebuild,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    annotations = await _load_annotations(db, user_id, book_id)
    texts = [a.content for a in annotations if a.content.strip()]
    current_hash = _content_hash(texts)

    if not texts:
        logger.info(
            'knowledge.build_graph.no_annotations',
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return GraphData(nodes=[], edges=[])

    cached = await _try_load_cached(
        user_id, book_id, current_hash, force_rebuild, len(annotations),
    )
    if cached is not None:
        return cached

    data = await _extract_and_build_graph(texts, annotations, user_id, book_id)

    await _persist_graph(user_id, book_id, data, current_hash)

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'knowledge.build_graph.completed',
        annotation_count=len(annotations),
        concept_count=len(data.nodes),
        node_count=len(data.nodes),
        edge_count=len(data.edges),
        latency_ms=elapsed,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    return data


async def search_concepts(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
) -> list[ConceptSearchResult]:
    """Search concepts in the graph matching the given query."""
    t0 = time.monotonic()
    logger.info(
        'knowledge.search_concepts.started',
        query=query[:100],
        user_id=str(user_id),
        book_id=str(book_id),
    )
    graph_data = await build_graph(db, user_id, book_id)
    query_lower = query.lower()

    results: list[ConceptSearchResult] = []
    for node in graph_data.nodes:
        if query_lower in node.label.lower():
            related = [
                edge.target if edge.source == node.id else edge.source
                for edge in graph_data.edges
                if edge.source == node.id or edge.target == node.id
            ]
            results.append(ConceptSearchResult(
                concept=node.label,
                relevance=1.0 if node.label.lower() == query_lower else 0.7,
                related=related,
                mentions=node.size,
            ))

    results.sort(key=lambda r: r.relevance, reverse=True)

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'knowledge.search_concepts.completed',
        query=query[:100],
        result_count=len(results[:10]),
        latency_ms=elapsed,
        user_id=str(user_id),
        book_id=str(book_id),
    )
    return results[:10]


async def get_concepts(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """List all concepts in the knowledge graph."""
    logger.info(
        'knowledge.get_concepts.started',
        user_id=str(user_id),
        book_id=str(book_id),
    )
    graph_data = await build_graph(db, user_id, book_id)
    concepts = [
        {
            'id': node.id,
            'label': node.label,
            'type': node.type,
            'size': node.size,
        }
        for node in graph_data.nodes
    ]
    logger.info(
        'knowledge.get_concepts.completed',
        concept_count=len(concepts),
        user_id=str(user_id),
        book_id=str(book_id),
    )
    return concepts


async def _load_user_book_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> dict[UUID, list]:
    """Load all annotations for a user's books and group by book_id."""
    from sqlalchemy import select as sa_select
    from app.models.annotation import Annotation

    if not book_ids:
        return {}

    all_annotations = list((await db.execute(
        sa_select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id.in_(book_ids),
        )
        .order_by(Annotation.created_at),
    )).scalars().all())

    ann_by_book: dict[UUID, list] = {}
    for ann in all_annotations:
        ann_by_book.setdefault(ann.book_id, []).append(ann)
    return ann_by_book


async def _merge_cached_graphs_for_books(
    user_id: UUID,
    book_ids: list[UUID],
    ann_by_book: dict[UUID, list],
) -> dict[str, list[dict]]:
    """Load cached graphs per book and merge nodes/edges into flat lists.

    Nodes are merged by ``id`` (the concept label) so the same concept extracted
    across multiple books becomes a single node with accumulated ``size`` /
    ``annotationCount`` / ``sourceBookIds``. Edges are deduped by
    ``(source, target)``. Without this, duplicate node ids break the frontend's
    React keys and node-lookup map.
    """
    nodes_by_id: dict[str, dict] = {}
    seen_edges: set[tuple[str, str]] = set()
    all_edges: list[dict] = []

    for bid in book_ids:
        try:
            annotations = ann_by_book.get(bid, [])
            texts = [a.content for a in annotations if a.content.strip()]
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(user_id, bid, current_hash)
            if cached is None:
                continue
            for node in cached.nodes:
                nd = node.model_dump(by_alias=True, mode='json')
                nid = nd.get('id')
                if not nid:
                    continue
                existing = nodes_by_id.get(nid)
                if existing is None:
                    nodes_by_id[nid] = nd
                    continue
                existing['size'] = existing.get('size', 1) + nd.get('size', 1)
                existing['annotationCount'] = (
                    existing.get('annotationCount', 0) + nd.get('annotationCount', 0)
                )
                sbids = existing.get('sourceBookIds', [])
                for sbid in nd.get('sourceBookIds', []):
                    if sbid not in sbids:
                        sbids.append(sbid)
                existing['sourceBookIds'] = sbids
            for edge in cached.edges:
                ed = edge.model_dump(by_alias=True, mode='json')
                key = (ed.get('source', ''), ed.get('target', ''))
                if key in seen_edges:
                    continue
                seen_edges.add(key)
                all_edges.append(ed)
        except (ValueError, RuntimeError) as exc:
            logger.warning('Failed to load cached graph for book %s', bid, exc_info=True)
            continue

    return {'nodes': list(nodes_by_id.values()), 'edges': all_edges}


async def get_all_cached_graphs(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, list[dict]]:
    """Load all cached knowledge graphs for a user (no LLM calls).

    Returns ``{'nodes': [...], 'edges': [...]}`` merged from every book.
    """
    from sqlalchemy import select as sa_select
    from app.models.book import Book

    rows = await db.execute(
        sa_select(Book.id).where(Book.user_id == user_id),
    )
    book_ids = [row[0] for row in rows.all()]

    ann_by_book = await _load_user_book_annotations(db, user_id, book_ids)
    return await _merge_cached_graphs_for_books(user_id, book_ids, ann_by_book)
