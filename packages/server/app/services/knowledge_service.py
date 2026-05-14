"""Knowledge graph service — NetworkX-based concept extraction and graph building.

Persistence strategy:
  - Graphs are cached in Redis for 7 days (key: ``kg:{user_id}:{book_id}:graph``).
  - A content hash is stored alongside the graph so that annotation changes
    automatically invalidate the cache.
  - Callers can pass ``force_rebuild=True`` to skip the cache and regenerate.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any
from uuid import UUID

import structlog

import networkx as nx
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis as _get_redis
from app.models.annotation import Annotation
from app.prompts import KNOWLEDGE_EXTRACTION_HUMAN, KNOWLEDGE_EXTRACTION_SYSTEM
from app.schemas.knowledge import (
    ConceptSearchResult,
    GraphData,
    GraphEdge,
    GraphNode,
)
from app.schemas.llm_outputs import ConceptList
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_annotations
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.knowledge')

# ---------------------------------------------------------------------------
# Redis key layout
# ---------------------------------------------------------------------------
# kg:{user_id}:{book_id}:graph  – serialised GraphData JSON (7-day TTL)
# kg:{user_id}:{book_id}:hash   – content hash hex string (7-day TTL)
# ---------------------------------------------------------------------------

GRAPH_KEY_PREFIX = 'kg:'
GRAPH_TTL = 7 * 86_400  # 7 days


def _graph_cache_key(user_id: UUID, book_id: UUID) -> str:
    return f'{GRAPH_KEY_PREFIX}{user_id}:{book_id}:graph'


def _hash_cache_key(user_id: UUID, book_id: UUID) -> str:
    return f'{GRAPH_KEY_PREFIX}{user_id}:{book_id}:hash'


def _content_hash(texts: list[str]) -> str:
    """Deterministic SHA-256 hash over the concatenated annotation content."""
    h = hashlib.sha256()
    for text in texts:
        h.update(text.encode())
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


async def _load_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    limit: int = 50,
) -> list[Annotation]:
    """Load annotations for a given user + book (capped to avoid token overflow)."""
    result = await db.execute(
        select(Annotation)
        .where(
            Annotation.user_id == user_id,
            Annotation.book_id == book_id,
        )
        .order_by(Annotation.created_at)
        .limit(limit),
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# LLM concept extraction
# ---------------------------------------------------------------------------


async def _extract_concepts_via_llm(
    texts: list[str],
    user_id: UUID | None = None,
    book_id: UUID | None = None,
) -> list[dict[str, Any]]:
    """Use LLM to extract concepts/entities from annotation texts.

    Returns a list of dicts: {name, type, related: [...]}.
    """
    if not texts:
        return []

    combined = '\n---\n'.join(texts[:20])

    # Sanitize input to prevent prompt injection
    combined = sanitize_annotations(combined)

    # Enforce token budget to avoid context window overflow
    budget = TokenBudget()
    combined = budget.add(combined, 'annotations')

    system_prompt = KNOWLEDGE_EXTRACTION_SYSTEM.template
    human_prompt = KNOWLEDGE_EXTRACTION_HUMAN.template.format(annotations=combined)

    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=[],
        log_label='Knowledge concept extraction',
        schema_class=ConceptList,
        user_id=str(user_id) if user_id else None,
        book_id=str(book_id) if book_id else None,
    )

    if isinstance(result, list):
        # LLM returned a bare array — wrap in expected container shape
        return result

    if isinstance(result, dict) and 'concepts' in result:
        # Pydantic-validated ConceptList.model_dump()
        return result['concepts']

    return []


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------


def _extract_concepts_from_keywords(
    texts: list[str],
) -> list[dict[str, Any]]:
    """Rule-based concept extraction fallback when LLM is unavailable.

    Extracts capitalized phrases and key noun patterns from text.
    """
    import re

    concepts: dict[str, dict[str, Any]] = {}

    for text in texts:
        # Extract capitalized phrases (potential proper nouns/titles)
        caps = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b', text)
        for phrase in caps:
            name = phrase.strip()
            if name in concepts:
                concepts[name]['size'] = (concepts[name].get('size', 0) or 0) + 1
            else:
                concepts[name] = {'name': name, 'type': 'entity', 'related': [], 'size': 1}

        # Extract quoted terms as key concepts
        quoted = re.findall(r'"([^"]+)"', text)
        for term in quoted:
            if len(term) > 3:
                if term not in concepts:
                    concepts[term] = {'name': term, 'type': 'theme', 'related': [], 'size': 1}
                else:
                    concepts[term]['size'] = (concepts[term].get('size', 0) or 0) + 1

    # Link co-occurring concepts
    concept_list = list(concepts.values())
    for i, c1 in enumerate(concept_list):
        for c2 in concept_list[i + 1:]:
            if c1.get('related') is not None and len(c1['related']) < 5:
                c1['related'].append(c2['name'])
            if c2.get('related') is not None and len(c2['related']) < 5:
                c2['related'].append(c1['name'])

    return concept_list[:30]  # Cap at 30 concepts


# ---------------------------------------------------------------------------
# Graph construction helpers
# ---------------------------------------------------------------------------


def _build_nx_graph(concepts: list[dict[str, Any]]) -> nx.Graph:
    """Build a NetworkX graph from extracted concepts."""
    graph = nx.Graph()

    for concept in concepts:
        name = concept.get('name', '').strip()
        if not name:
            continue

        node_type = concept.get('type', 'concept')
        related = concept.get('related', [])

        if not graph.has_node(name):
            graph.add_node(name, type=node_type, size=1)
        else:
            graph.nodes[name]['size'] += 1

        for related_name in related:
            related_name = related_name.strip()
            if not related_name or related_name == name:
                continue
            if not graph.has_node(related_name):
                graph.add_node(related_name, type='concept', size=1)
            if graph.has_edge(name, related_name):
                graph[name][related_name]['weight'] += 1.0
            else:
                graph.add_edge(name, related_name, weight=1.0, label='related')

    return graph


def _graph_to_data(graph: nx.Graph) -> GraphData:
    """Convert NetworkX graph to frontend-friendly GraphData."""
    nodes = [
        GraphNode(
            id=name,
            label=name,
            type=data.get('type', 'concept'),
            size=data.get('size', 1),
            metadata={},
        )
        for name, data in graph.nodes(data=True)
    ]
    edges = [
        GraphEdge(
            source=source,
            target=target,
            label=data.get('label', ''),
            weight=data.get('weight', 1.0),
        )
        for source, target, data in graph.edges(data=True)
    ]
    return GraphData(nodes=nodes, edges=edges)


# ---------------------------------------------------------------------------
# Redis persistence
# ---------------------------------------------------------------------------


async def _load_cached_graph(
    user_id: UUID,
    book_id: UUID,
    current_hash: str,
) -> GraphData | None:
    """Try to load a cached graph from Redis.

    Returns ``None`` when:
      - Redis is unavailable
      - No cached graph exists
      - The content hash has changed (auto-invalidation)
    """
    cache_key = _graph_cache_key(user_id, book_id)
    hash_key = _hash_cache_key(user_id, book_id)

    try:
        r = _get_redis()
        cached_hash, cached_graph = await r.mget(hash_key, cache_key)

        if cached_graph is None:
            return None

        # Content hash mismatch — annotations changed, invalidate
        if cached_hash is not None and cached_hash != current_hash:
            logger.info(
                'knowledge.cache_hash_mismatch',
                user_id=str(user_id),
                book_id=str(book_id),
            )
            await r.delete(cache_key, hash_key)
            return None

        return GraphData.model_validate_json(cached_graph)
    except Exception:
        logger.debug('knowledge.cache_read_failed')
        return None


async def _persist_graph(
    user_id: UUID,
    book_id: UUID,
    graph_data: GraphData,
    content_hash: str,
) -> None:
    """Persist graph data and content hash to Redis with 7-day TTL."""
    cache_key = _graph_cache_key(user_id, book_id)
    hash_key = _hash_cache_key(user_id, book_id)

    try:
        r = _get_redis()
        pipe = r.pipeline()
        pipe.setex(cache_key, GRAPH_TTL, graph_data.model_dump_json())
        pipe.setex(hash_key, GRAPH_TTL, content_hash)
        await pipe.execute()
    except Exception:
        logger.debug('knowledge.cache_write_failed')


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def build_graph(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    force_rebuild: bool = False,
) -> GraphData:
    """Build (or load from cache) a knowledge graph for a user's annotations.

    Args:
        db: Database session.
        user_id: Owner of the annotations.
        book_id: Book whose annotations to process.
        force_rebuild: When ``True``, skip the cache and regenerate the graph
            from scratch via LLM.

    Returns:
        ``GraphData`` with ``nodes`` and ``edges`` lists (always valid, never
        ``None`` -- empty lists when there are no annotations).
    """
    t0 = time.monotonic()
    logger.info(
        'knowledge.build_graph.started',
        force_rebuild=force_rebuild,
        user_id=str(user_id),
        book_id=str(book_id),
    )

    # 1. Load annotations and compute content hash --------------------------
    annotations = await _load_annotations(db, user_id, book_id)
    texts = [a.content for a in annotations if a.content.strip()]
    current_hash = _content_hash(texts)

    # 2. Return empty graph when there is nothing to process ----------------
    if not texts:
        logger.info(
            'knowledge.build_graph.no_annotations',
            user_id=str(user_id),
            book_id=str(book_id),
        )
        return GraphData(nodes=[], edges=[])

    # 3. Try cache (unless force_rebuild) -----------------------------------
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

    # 4. Build via LLM (with rule-based fallback) ---------------------------
    concepts = await _extract_concepts_via_llm(texts, user_id=user_id, book_id=book_id)

    if not concepts:
        concepts = _extract_concepts_from_keywords(texts)

    graph = _build_nx_graph(concepts)
    data = _graph_to_data(graph)

    # 5. Persist to Redis ---------------------------------------------------
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
