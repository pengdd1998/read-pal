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

    # 1. Load annotations and compute content hash
    annotations = await _load_annotations(db, user_id, book_id)
    texts = [a.content for a in annotations if a.content.strip()]
    current_hash = _content_hash(texts)

    # 2. Return empty graph when there is nothing to process
    if not texts:
        logger.info(
            'knowledge.build_graph.no_annotations',
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return GraphData(nodes=[], edges=[])

    # 3. Try cache (unless force_rebuild)
    if not force_rebuild:
        cached = await _load_cached_graph(user_id, book_id, current_hash)
        if cached is not None:
            logger.info(
                'knowledge.build_graph.cache_hit',
                annotation_count=len(annotations),
                node_count=len(cached.nodes),
                edge_count=len(cached.edges),
                user_id=str(user_id),
                book_id=str(book_id),
            )
            return cached

    logger.info(
        'knowledge.build_graph.cache_miss',
        force_rebuild=force_rebuild,
        annotation_count=len(annotations),
        user_id=str(user_id),
        book_id=str(book_id),
    )

    # 4. Build via LLM (with rule-based fallback)
    concepts = await _extract_concepts_via_llm(texts, user_id=user_id, book_id=book_id)

    if not concepts:
        concepts = _extract_concepts_from_keywords(texts)

    # Compute freshness map from annotation recency
    freshness_map: dict[str, float] = {}
    for concept in concepts:
        cname = concept.get('name', '').strip()
        if cname:
            freshness_map[cname] = _compute_freshness(annotations, cname)

    graph = _build_nx_graph(concepts, book_id=book_id, freshness_map=freshness_map)
    data = _graph_to_data(graph)

    # 5. Persist to Redis
    await _persist_graph(user_id, book_id, data, current_hash)

    elapsed = int((time.monotonic() - t0) * 1000)
    logger.info(
        'knowledge.build_graph.completed',
        annotation_count=len(annotations),
        concept_count=len(concepts),
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
