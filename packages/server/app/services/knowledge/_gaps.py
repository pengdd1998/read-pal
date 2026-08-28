"""Knowledge gap detection across the user's combined knowledge graph."""

from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import UUID

import networkx as nx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.schemas.knowledge import KnowledgeGap
from app.services.knowledge._cache import _content_hash, _load_cached_graph
from app.utils.db import db_error_guard

logger = structlog.get_logger('read-pal.knowledge')


async def _batch_load_annotations(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
    limit_per_book: int = 50,
) -> dict[UUID, list[Annotation]]:
    """Load annotations for multiple books in a single query, then group by book_id.

    Replaces N individual ``_load_annotations`` calls with one batch query.
    """
    if not book_ids:
        return {}
    async with db_error_guard('_batch_load_annotations', user_id=str(user_id)):
        result = await db.execute(
            select(Annotation)
            .where(
                Annotation.user_id == user_id,
                Annotation.book_id.in_(book_ids),
            )
            .order_by(Annotation.book_id, Annotation.created_at),
        )
        grouped: dict[UUID, list[Annotation]] = defaultdict(list)
        for ann in result.scalars().all():
            grouped[ann.book_id].append(ann)
        return {bid: anns[:limit_per_book] for bid, anns in grouped.items()}


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
            'Read other books covering this topic to strengthen connections.'
        )
    if not description:
        return (
            'Add notes about this concept during your next reading session.'
        )
    return 'Review your highlights related to this concept.'


def _build_sub_graph_from_cached(cached: Any) -> nx.Graph:
    """Build a NetworkX graph from cached node/edge data, merging duplicates."""
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
            sub_graph.nodes[node.id]['size'] += node.size
            existing_books = sub_graph.nodes[node.id].get('source_book_ids', [])
            for sbid in node.source_book_ids:
                if sbid not in existing_books:
                    existing_books.append(sbid)
            sub_graph.nodes[node.id]['annotation_count'] = (
                sub_graph.nodes[node.id].get('annotation_count', 0)
                + node.annotation_count
            )
            existing_fresh = sub_graph.nodes[node.id].get('freshness', 1.0)
            sub_graph.nodes[node.id]['freshness'] = min(
                existing_fresh, node.freshness,
            )
    for edge in cached.edges:
        if sub_graph.has_edge(edge.source, edge.target):
            sub_graph[edge.source][edge.target]['weight'] += edge.weight
        else:
            sub_graph.add_edge(
                edge.source, edge.target,
                weight=edge.weight, label=edge.label,
            )
    return sub_graph


def _merge_sub_graph_into(merged: nx.Graph, sub_graph: nx.Graph) -> None:
    """Merge a sub-graph into the combined merged graph, accumulating attributes."""
    for name, data in sub_graph.nodes(data=True):
        if not merged.has_node(name):
            node_kwargs = {'name': name}
            node_kwargs.update(data)
            merged.add_node(**node_kwargs)
        else:
            # Capture pre-merge values BEFORE mutating annotation_count, otherwise
            # old_count would include new_count and the weighted freshness below
            # would double-count the incoming sub-graph.
            old_count = merged.nodes[name].get('annotation_count', 0)
            old_fresh = merged.nodes[name].get('freshness', 1.0)
            new_count = data.get('annotation_count', 0)
            new_fresh = data.get('freshness', 1.0)

            merged.nodes[name]['size'] = (
                merged.nodes[name].get('size', 0) + data.get('size', 0)
            )
            merged.nodes[name]['annotation_count'] = old_count + new_count
            existing = merged.nodes[name].get('source_book_ids', [])
            for sbid in data.get('source_book_ids', []):
                if sbid not in existing:
                    existing.append(sbid)
            merged.nodes[name]['source_book_ids'] = existing

            total = old_count + new_count
            if total > 0:
                merged.nodes[name]['freshness'] = (
                    old_fresh * old_count + new_fresh * new_count
                ) / total

    for src, tgt, data in sub_graph.edges(data=True):
        if merged.has_edge(src, tgt):
            merged[src][tgt]['weight'] += data.get('weight', 1.0)
        else:
            merged.add_edge(src, tgt, **data)


def _make_gap(
    concept: str,
    reason: str,
    suggestion: str,
    graph: nx.Graph,
    total_clusters: int,
) -> KnowledgeGap:
    """Create a KnowledgeGap with the suggested action derived from the graph."""
    return KnowledgeGap(
        concept=concept,
        reason=reason,
        suggestion=suggestion,
        suggested_action=_determine_suggested_action(concept, graph),
        connected_clusters=total_clusters,
    )


def _identify_gap_nodes(
    graph: nx.Graph,
    total_clusters: int,
) -> list[KnowledgeGap]:
    """Find isolated nodes, weakly connected nodes, and disconnected cluster gaps."""
    gaps: list[KnowledgeGap] = []

    for node_name in graph.nodes:
        deg = graph.degree(node_name)
        if deg == 0:
            gaps.append(_make_gap(
                node_name, 'Isolated concept with no connections',
                f"Read more about '{node_name}' -- it appears disconnected from your other knowledge.",
                graph, total_clusters,
            ))
        elif deg == 1:
            gaps.append(_make_gap(
                node_name, 'Weakly connected concept (only 1 link)',
                f"Explore connections between '{node_name}' and related topics.",
                graph, total_clusters,
            ))

    for component in nx.connected_components(graph):
        if len(component) > 1 and total_clusters > 1:
            representative = next(iter(component))
            if not any(g.concept == representative for g in gaps):
                gaps.append(_make_gap(
                    representative,
                    f'Part of a disconnected cluster of {len(component)} concepts',
                    'Bridge the gap between these concept clusters by reading about their intersection.',
                    graph, total_clusters,
                ))
    return gaps


def _deduplicate_gaps(gaps: list[KnowledgeGap], limit: int = 10) -> list[KnowledgeGap]:
    """Deduplicate gaps by concept name and cap at the given limit."""
    seen: set[str] = set()
    unique: list[KnowledgeGap] = []
    for gap in gaps:
        if gap.concept not in seen:
            seen.add(gap.concept)
            unique.append(gap)
        if len(unique) >= limit:
            break
    return unique


async def _build_merged_graph(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> nx.Graph:
    """Build a merged knowledge graph from cached graphs across all books."""
    annotations_by_book = await _batch_load_annotations(db, user_id, book_ids)
    merged = nx.Graph()
    for bid in book_ids:
        try:
            annotations = annotations_by_book.get(bid, [])
            texts = [a.content for a in annotations if a.content.strip()]
            if not texts:
                continue
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(user_id, bid, current_hash)
            if cached is None or not cached.nodes:
                continue
            sub_graph = _build_sub_graph_from_cached(cached)
            _merge_sub_graph_into(merged, sub_graph)
        except Exception:
            logger.warning('Failed to load graph for book %s', bid, exc_info=True)
            continue
    return merged


async def detect_gaps(
    db: AsyncSession,
    user_id: UUID,
) -> list[KnowledgeGap]:
    """Detect knowledge gaps in the user's combined knowledge graph.

    Identifies isolated concepts and disconnected clusters that represent
    areas where the user's understanding could be strengthened.
    """
    from app.models.book import Book as BookModel

    try:
        async with db_error_guard('detect_gaps', user_id=str(user_id)):
            result = await db.execute(
                select(BookModel.id).where(BookModel.user_id == user_id),
            )
            book_ids = [row[0] for row in result.all()]
        if not book_ids:
            return []

        merged = await _build_merged_graph(db, user_id, book_ids)

        if not merged.nodes:
            return []

        total_clusters = len(list(nx.connected_components(merged)))
        if total_clusters <= 1 and all(merged.degree(n) > 1 for n in merged.nodes):
            return []

        gaps = _identify_gap_nodes(merged, total_clusters)
        unique_gaps = _deduplicate_gaps(gaps)

        logger.info(
            'knowledge.detect_gaps.completed',
            gap_count=len(unique_gaps),
            total_clusters=total_clusters,
            user_id=str(user_id),
        )
        return unique_gaps
    except Exception as exc:
        logger.error(
            'knowledge.detect_gaps.failed',
            error=str(exc)[:500],
            user_id=str(user_id),
            exc_info=True,
        )
        return []
