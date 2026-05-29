"""NetworkX graph construction and freshness computation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import networkx as nx

from app.models.annotation import Annotation
from app.schemas.knowledge import (
    GraphData,
    GraphEdge,
    GraphNode,
)


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
