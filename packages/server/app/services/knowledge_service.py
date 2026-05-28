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
    KnowledgeGap,
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


def _knowledge_cache_ttl() -> int:
    from app.config import get_settings
    return get_settings().cache_knowledge_ttl_seconds


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


def _compute_freshness(
    annotations: list[Annotation],
    concept_name: str,
) -> float:
    """Compute freshness for a concept based on annotation recency.

    Freshness decays from 1.0 to 0.0 over 90 days using the oldest
    annotation that mentions the concept (case-insensitive substring match).
    Falls back to 1.0 when no annotation mentions the concept directly
    (uses the overall oldest annotation instead).
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    relevant_dates: list[datetime] = []

    name_lower = concept_name.lower()
    for ann in annotations:
        if ann.content and name_lower in ann.content.lower():
            created = ann.created_at
            # Handle both offset-naive and offset-aware datetimes
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            relevant_dates.append(created)

    # Fallback: use all annotation dates
    if not relevant_dates:
        for ann in annotations:
            if ann.created_at:
                created = ann.created_at
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                relevant_dates.append(created)

    if not relevant_dates:
        return 1.0

    oldest = min(relevant_dates)
    days_since = (now - oldest).days
    return max(0.0, 1.0 - days_since / 90.0)


def _build_nx_graph(
    concepts: list[dict[str, Any]],
    book_id: UUID | None = None,
    freshness_map: dict[str, float] | None = None,
) -> nx.Graph:
    """Build a NetworkX graph from extracted concepts."""
    graph = nx.Graph()

    for concept in concepts:
        name = concept.get('name', '').strip()
        if not name:
            continue

        node_type = concept.get('type', 'concept')
        description = concept.get('description', '')
        related = concept.get('related', [])
        node_freshness = (freshness_map or {}).get(name, 1.0)

        if not graph.has_node(name):
            graph.add_node(
                name,
                type=node_type,
                size=1,
                description=description,
                source_book_ids=[str(book_id)] if book_id else [],
                annotation_count=1,
                freshness=node_freshness,
            )
        else:
            graph.nodes[name]['size'] += 1
            graph.nodes[name]['annotation_count'] = (
                graph.nodes[name].get('annotation_count', 0) + 1
            )
            # Keep the lower freshness (older data dominates)
            existing = graph.nodes[name].get('freshness', 1.0)
            graph.nodes[name]['freshness'] = min(existing, node_freshness)
            if description and not graph.nodes[name].get('description'):
                graph.nodes[name]['description'] = description
            if book_id:
                book_ids = graph.nodes[name].get('source_book_ids', [])
                bid = str(book_id)
                if bid not in book_ids:
                    book_ids.append(bid)
                    graph.nodes[name]['source_book_ids'] = book_ids

        for related_name in related:
            related_name = related_name.strip()
            if not related_name or related_name == name:
                continue
            related_freshness = (freshness_map or {}).get(related_name, 1.0)
            if not graph.has_node(related_name):
                graph.add_node(
                    related_name,
                    type='concept',
                    size=1,
                    description='',
                    source_book_ids=[str(book_id)] if book_id else [],
                    annotation_count=0,
                    freshness=related_freshness,
                )
            else:
                existing = graph.nodes[related_name].get('freshness', 1.0)
                graph.nodes[related_name]['freshness'] = min(
                    existing, related_freshness,
                )
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
            description=data.get('description', ''),
            source_book_ids=data.get('source_book_ids', []),
            annotation_count=data.get('annotation_count', 0),
            freshness=data.get('freshness', 1.0),
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
        pipe.setex(cache_key, _knowledge_cache_ttl(), graph_data.model_dump_json())
        pipe.setex(hash_key, _knowledge_cache_ttl(), content_hash)
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

    # Compute freshness map from annotation recency
    freshness_map: dict[str, float] = {}
    for concept in concepts:
        cname = concept.get('name', '').strip()
        if cname:
            freshness_map[cname] = _compute_freshness(annotations, cname)

    graph = _build_nx_graph(concepts, book_id=book_id, freshness_map=freshness_map)
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


async def get_cross_book_themes(
    db: AsyncSession,
    user_id: UUID,
) -> dict[str, Any]:
    """Find themes and connections across all user's books.

    Strategy:
      1. Load cached graphs for each book.
      2. Find concept nodes that appear across multiple books (label overlap).
      3. Return shared themes and cross-book connections.
    """
    from app.models.book import Book as BookModel

    result = await db.execute(
        select(BookModel.id, BookModel.title).where(BookModel.user_id == user_id),
    )
    book_rows = result.all()
    if not book_rows:
        return {'themes': [], 'connections': []}

    # Collect per-book concept sets
    book_concepts: dict[str, dict[str, dict]] = {}  # book_id -> {label: {node, bookTitle}}
    for book_id, book_title in book_rows:
        try:
            annotations = await _load_annotations(db, user_id, book_id)
            texts = [a.content for a in annotations if a.content.strip()]
            if not texts:
                continue
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(user_id, book_id, current_hash)
            if cached is None or not cached.nodes:
                continue
            for node in cached.nodes:
                if node.label not in book_concepts:
                    book_concepts[node.label] = {}
                book_concepts[node.label][str(book_id)] = {
                    'node': node,
                    'bookTitle': book_title,
                }
        except Exception:
            logger.warning('Failed to load graph for book %s', book_id, exc_info=True)
            continue

    # Find themes: concepts appearing in 2+ books
    themes = []
    for label, book_map in book_concepts.items():
        if len(book_map) >= 2:
            theme_books = [
                {'bookId': bid, 'bookTitle': info['bookTitle']}
                for bid, info in book_map.items()
            ]
            total_size = sum(info['node'].size for info in book_map.values())
            themes.append({
                'label': label,
                'books': theme_books,
                'strength': total_size,
            })

    themes.sort(key=lambda t: t['strength'], reverse=True)

    # Find connections: related concepts from different books
    connections = []
    seen_pairs: set[frozenset[str]] = set()
    for label, book_map in book_concepts.items():
        if len(book_map) < 2:
            continue
        for edge_label, edge_books in book_concepts.items():
            if edge_label == label:
                continue
            shared = set(book_map.keys()) & set(edge_books.keys())
            if len(shared) >= 2:
                pair = frozenset([label, edge_label])
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                connections.append({
                    'source': label,
                    'target': edge_label,
                    'books': list(shared),
                })

    logger.info(
        'knowledge.get_cross_book_themes.completed',
        theme_count=len(themes),
        connection_count=len(connections),
        user_id=str(user_id),
    )
    return {'themes': themes[:20], 'connections': connections[:30]}


async def detect_gaps(
    db: AsyncSession,
    user_id: UUID,
) -> list[KnowledgeGap]:
    """Detect knowledge gaps in the user's combined knowledge graph.

    Identifies isolated concepts and disconnected clusters that represent
    areas where the user's understanding could be strengthened.
    """
    from app.models.book import Book as BookModel

    result = await db.execute(
        select(BookModel.id).where(BookModel.user_id == user_id),
    )
    book_ids = [row[0] for row in result.all()]
    if not book_ids:
        return []

    # Merge all cached graphs into a single NetworkX graph
    merged = nx.Graph()
    for bid in book_ids:
        try:
            annotations = await _load_annotations(db, user_id, bid)
            texts = [a.content for a in annotations if a.content.strip()]
            if not texts:
                continue
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(user_id, bid, current_hash)
            if cached is None or not cached.nodes:
                continue
            sub_graph = nx.Graph()
            for node in cached.nodes:
                if not sub_graph.has_node(node.id):
                    sub_graph.add_node(
                        node.id,
                        type=node.type,
                        size=node.size,
                        description=node.description,
                        source_book_ids=node.source_book_ids,
                        annotation_count=node.annotation_count,
                        freshness=node.freshness,
                    )
                else:
                    sub_graph.nodes[node.id]["size"] += node.size
                    existing_books = sub_graph.nodes[node.id].get(
                        "source_book_ids", [],
                    )
                    for sbid in node.source_book_ids:
                        if sbid not in existing_books:
                            existing_books.append(sbid)
                    sub_graph.nodes[node.id]["annotation_count"] = (
                        sub_graph.nodes[node.id].get("annotation_count", 0)
                        + node.annotation_count
                    )
                    # Take minimum freshness across duplicates
                    existing_fresh = sub_graph.nodes[node.id].get("freshness", 1.0)
                    sub_graph.nodes[node.id]["freshness"] = min(
                        existing_fresh, node.freshness,
                    )
            for edge in cached.edges:
                if sub_graph.has_edge(edge.source, edge.target):
                    sub_graph[edge.source][edge.target]["weight"] += edge.weight
                else:
                    sub_graph.add_edge(
                        edge.source, edge.target,
                        weight=edge.weight, label=edge.label,
                    )

            # Merge sub_graph into merged
            for name, data in sub_graph.nodes(data=True):
                if not merged.has_node(name):
                    node_kwargs = {"name": name}
                    node_kwargs.update(data)
                    merged.add_node(**node_kwargs)
                else:
                    merged.nodes[name]["size"] = (
                        merged.nodes[name].get("size", 0) + data.get("size", 0)
                    )
                    merged.nodes[name]["annotation_count"] = (
                        merged.nodes[name].get("annotation_count", 0)
                        + data.get("annotation_count", 0)
                    )
                    existing = merged.nodes[name].get("source_book_ids", [])
                    for sbid in data.get("source_book_ids", []):
                        if sbid not in existing:
                            existing.append(sbid)
                    merged.nodes[name]["source_book_ids"] = existing
                    # Weighted average freshness by annotation count
                    old_count = merged.nodes[name].get("annotation_count", 0)
                    old_fresh = merged.nodes[name].get("freshness", 1.0)
                    new_count = data.get("annotation_count", 0)
                    new_fresh = data.get("freshness", 1.0)
                    total = old_count + new_count
                    if total > 0:
                        merged.nodes[name]["freshness"] = (
                            old_fresh * old_count + new_fresh * new_count
                        ) / total

            for src, tgt, data in sub_graph.edges(data=True):
                if merged.has_edge(src, tgt):
                    merged[src][tgt]["weight"] += data.get("weight", 1.0)
                else:
                    merged.add_edge(src, tgt, **data)
        except Exception:
            logger.warning("Failed to load graph for book %s", bid, exc_info=True)
            continue

    if not merged.nodes:
        return []

    # Find connected components (clusters)
    components = list(nx.connected_components(merged))
    total_clusters = len(components)

    if total_clusters <= 1 and all(
        merged.degree(n) > 1 for n in merged.nodes
    ):
        return []

    gaps: list[KnowledgeGap] = []

    def _determine_suggested_action(
        node_name: str,
        graph: nx.Graph,
    ) -> str:
        """Deterministic heuristic for actionable next-step per gap."""
        node_data = graph.nodes[node_name]
        source_books = node_data.get('source_book_ids', [])
        description = node_data.get('description', '')

        if len(source_books) <= 1:
            return (
                "Read other books covering this topic to strengthen connections."
            )
        if not description:
            return (
                "Add notes about this concept during your next reading session."
            )
        return "Review your highlights related to this concept."

    # Find isolated nodes (degree 0)
    for node_name in merged.nodes:
        if merged.degree(node_name) == 0:
            gaps.append(KnowledgeGap(
                concept=node_name,
                reason="Isolated concept with no connections",
                suggestion=(
                    f"Read more about '{node_name}' — it appears disconnected"
                    " from your other knowledge."
                ),
                suggested_action=_determine_suggested_action(
                    node_name, merged,
                ),
                connected_clusters=total_clusters,
            ))

    # Find low-degree nodes (degree 1) as potential gaps
    for node_name in merged.nodes:
        if 0 < merged.degree(node_name) <= 1:
            gaps.append(KnowledgeGap(
                concept=node_name,
                reason="Weakly connected concept (only 1 link)",
                suggestion=(
                    f"Explore connections between '{node_name}' and related"
                    ' topics.'
                ),
                suggested_action=_determine_suggested_action(
                    node_name, merged,
                ),
                connected_clusters=total_clusters,
            ))

    # Find disconnected clusters > 1 node
    for component in components:
        if len(component) > 1 and total_clusters > 1:
            representative = next(iter(component))
            if not any(g.concept == representative for g in gaps):
                cluster_size = len(component)
                reason_text = (
                    "Part of a disconnected cluster of "
                    + str(cluster_size)
                    + " concepts"
                )
                gaps.append(KnowledgeGap(
                    concept=representative,
                    reason=reason_text,
                    suggestion=(
                        "Bridge the gap between these concept clusters by"
                        " reading about their intersection."
                    ),
                    suggested_action=_determine_suggested_action(
                        representative, merged,
                    ),
                    connected_clusters=total_clusters,
                ))

    # Deduplicate and cap at 10
    seen: set[str] = set()
    unique_gaps: list[KnowledgeGap] = []
    for gap in gaps:
        if gap.concept not in seen:
            seen.add(gap.concept)
            unique_gaps.append(gap)
        if len(unique_gaps) >= 10:
            break

    logger.info(
        "knowledge.detect_gaps.completed",
        gap_count=len(unique_gaps),
        total_clusters=total_clusters,
        user_id=str(user_id),
    )
    return unique_gaps
