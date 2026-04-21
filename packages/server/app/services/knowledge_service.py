"""Knowledge graph service — NetworkX-based concept extraction and graph building."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import networkx as nx
import redis.asyncio as aioredis
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis as _get_redis
from app.models.annotation import Annotation
from app.models.book import Book
from app.schemas.knowledge import (
    ConceptSearchResult,
    GraphData,
    GraphEdge,
    GraphNode,
)
from app.services.llm import safe_llm_invoke

logger = logging.getLogger('read-pal.knowledge')

GRAPH_CACHE_PREFIX = 'graph:'
GRAPH_CACHE_TTL = 3600  # 1 hour


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


async def _extract_concepts_via_llm(
    texts: list[str],
) -> list[dict[str, Any]]:
    """Use LLM to extract concepts/entities from annotation texts.

    Returns a list of dicts: {name, type, related: [...]}.
    """
    if not texts:
        return []

    combined = '\n---\n'.join(texts[:20])  # limit to avoid token overflow

    system_prompt = (
        'You are a literary analysis assistant. Given reader highlights and notes, '
        'extract key concepts, characters, themes, and locations as structured JSON.\n\n'
        'Return a JSON array. Each element must have:\n'
        '  "name": string — the concept/character/theme/location name\n'
        '  "type": one of "concept", "character", "theme", "location"\n'
        '  "related": array of strings — other extracted names this one relates to\n\n'
        'Return ONLY the JSON array, no markdown fences.'
    )

    human_prompt = f'Analyse these reader annotations and extract concepts:\n\n{combined}'

    result = await safe_llm_invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ],
        fallback=[],
        log_label='Knowledge concept extraction',
    )

    if isinstance(result, list):
        return result

    return []


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
                graph.edges[name, related_name]['weight'] += 1.0
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


async def build_graph(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> GraphData:
    """Build a knowledge graph for a user's annotations on a book.

    Results are cached in Redis for 1 hour.
    """
    cache_key = f'{GRAPH_CACHE_PREFIX}{user_id}:{book_id}'

    # Check cache first
    try:
        r = _get_redis()
        cached = await r.get(cache_key)
        if cached:
            return GraphData.model_validate_json(cached)
    except Exception:
        logger.debug('Redis cache read failed, rebuilding graph')

    # Load annotations and extract concepts
    annotations = await _load_annotations(db, user_id, book_id)
    texts = [a.content for a in annotations if a.content.strip()]

    if not texts:
        return GraphData(nodes=[], edges=[])

    concepts = await _extract_concepts_via_llm(texts)
    graph = _build_nx_graph(concepts)
    data = _graph_to_data(graph)

    # Cache the result
    try:
        r = _get_redis()
        await r.setex(cache_key, GRAPH_CACHE_TTL, data.model_dump_json())
    except Exception:
        logger.debug('Redis cache write failed')

    return data


async def search_concepts(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    query: str,
) -> list[ConceptSearchResult]:
    """Search concepts in the graph matching the given query."""
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
    return results[:10]


async def get_concepts(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> list[dict[str, Any]]:
    """List all concepts in the knowledge graph."""
    graph_data = await build_graph(db, user_id, book_id)
    return [
        {
            'id': node.id,
            'label': node.label,
            'type': node.type,
            'size': node.size,
        }
        for node in graph_data.nodes
    ]
