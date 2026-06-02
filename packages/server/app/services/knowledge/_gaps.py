"""Knowledge gap detection across the user's combined knowledge graph."""

from __future__ import annotations

from collections import defaultdict
from uuid import UUID

import networkx as nx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation
from app.schemas.knowledge import KnowledgeGap
from app.services.knowledge._cache import _content_hash, _load_cached_graph

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

    # Batch-load annotations for all books in a single DB query
    annotations_by_book = await _batch_load_annotations(db, user_id, book_ids)

    # Merge all cached graphs into a single NetworkX graph
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
                    existing_books = sub_graph.nodes[node.id].get(
                        'source_book_ids', [],
                    )
                    for sbid in node.source_book_ids:
                        if sbid not in existing_books:
                            existing_books.append(sbid)
                    sub_graph.nodes[node.id]['annotation_count'] = (
                        sub_graph.nodes[node.id].get('annotation_count', 0)
                        + node.annotation_count
                    )
                    # Take minimum freshness across duplicates
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

            # Merge sub_graph into merged
            for name, data in sub_graph.nodes(data=True):
                if not merged.has_node(name):
                    node_kwargs = {'name': name}
                    node_kwargs.update(data)
                    merged.add_node(**node_kwargs)
                else:
                    merged.nodes[name]['size'] = (
                        merged.nodes[name].get('size', 0) + data.get('size', 0)
                    )
                    merged.nodes[name]['annotation_count'] = (
                        merged.nodes[name].get('annotation_count', 0)
                        + data.get('annotation_count', 0)
                    )
                    existing = merged.nodes[name].get('source_book_ids', [])
                    for sbid in data.get('source_book_ids', []):
                        if sbid not in existing:
                            existing.append(sbid)
                    merged.nodes[name]['source_book_ids'] = existing
                    # Weighted average freshness by annotation count
                    old_count = merged.nodes[name].get('annotation_count', 0)
                    old_fresh = merged.nodes[name].get('freshness', 1.0)
                    new_count = data.get('annotation_count', 0)
                    new_fresh = data.get('freshness', 1.0)
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
        except Exception:
            logger.warning('Failed to load graph for book %s', bid, exc_info=True)
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
                'Read other books covering this topic to strengthen connections.'
            )
        if not description:
            return (
                'Add notes about this concept during your next reading session.'
            )
        return 'Review your highlights related to this concept.'

    # Find isolated nodes (degree 0)
    for node_name in merged.nodes:
        if merged.degree(node_name) == 0:
            gaps.append(KnowledgeGap(
                concept=node_name,
                reason='Isolated concept with no connections',
                suggestion=(
                    f"Read more about '{node_name}' -- it appears disconnected"
                    ' from your other knowledge.'
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
                reason='Weakly connected concept (only 1 link)',
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
                    'Part of a disconnected cluster of '
                    + str(cluster_size)
                    + ' concepts'
                )
                gaps.append(KnowledgeGap(
                    concept=representative,
                    reason=reason_text,
                    suggestion=(
                        'Bridge the gap between these concept clusters by'
                        ' reading about their intersection.'
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
        'knowledge.detect_gaps.completed',
        gap_count=len(unique_gaps),
        total_clusters=total_clusters,
        user_id=str(user_id),
    )
    return unique_gaps
