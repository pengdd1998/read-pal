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

# Knowledge freshness decay period (days)
_KNOWLEDGE_FRESHNESS_DAYS = 90.0


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
    # Clamp to [0, 1]: a future-dated annotation (clock skew or naive/aware tz
    # mismatch) would otherwise yield >1.0, violating GraphNode.freshness(le=1.0)
    # and raising a ValidationError that 500s the /graph endpoint.
    return min(1.0, max(0.0, 1.0 - days_since / _KNOWLEDGE_FRESHNESS_DAYS))


def _resolve_edge_label(
    concept: dict[str, Any],
    related_name: str,
) -> str:
    """Look up the LLM-provided relationship label for an edge.

    Falls back to "related" when no structured relationship is found.
    """
    relationships = concept.get('relationships', [])
    for rel in relationships:
        if isinstance(rel, dict) and rel.get('target', '').strip() == related_name:
            label = rel.get('label', '').strip()
            if label:
                return label
    return 'related'


def _upsert_concept_node(
    graph: nx.Graph,
    name: str,
    node_type: str,
    description: str,
    book_id: UUID | None,
    freshness: float,
) -> None:
    """Insert a new concept node or update an existing one in the graph."""
    if not graph.has_node(name):
        graph.add_node(
            name,
            type=node_type,
            size=1,
            description=description,
            source_book_ids=[str(book_id)] if book_id else [],
            annotation_count=1,
            freshness=freshness,
        )
        return

    attrs = graph.nodes[name]
    attrs['size'] += 1
    attrs['annotation_count'] = attrs.get('annotation_count', 0) + 1
    # Keep the lower freshness (older data dominates)
    attrs['freshness'] = min(attrs.get('freshness', 1.0), freshness)
    if description and not attrs.get('description'):
        attrs['description'] = description
    if book_id:
        book_ids = attrs.get('source_book_ids', [])
        bid = str(book_id)
        if bid not in book_ids:
            book_ids.append(bid)
            attrs['source_book_ids'] = book_ids


def _add_related_edge(
    graph: nx.Graph,
    source: str,
    target: str,
    edge_label: str,
    book_id: UUID | None,
    freshness: float,
) -> None:
    """Ensure the target node exists, then add or strengthen an edge."""
    if not graph.has_node(target):
        graph.add_node(
            target,
            type='concept',
            size=1,
            description='',
            source_book_ids=[str(book_id)] if book_id else [],
            annotation_count=0,
            freshness=freshness,
        )
    else:
        existing = graph.nodes[target].get('freshness', 1.0)
        graph.nodes[target]['freshness'] = min(existing, freshness)

    if graph.has_edge(source, target):
        graph[source][target]['weight'] += 1.0
        # Prefer a non-generic label over "related"
        current = graph[source][target].get('label', 'related')
        if edge_label != 'related' and current == 'related':
            graph[source][target]['label'] = edge_label
    else:
        graph.add_edge(source, target, weight=1.0, label=edge_label)


def _build_nx_graph(
    concepts: list[dict[str, Any]],
    book_id: UUID | None = None,
    freshness_map: dict[str, float] | None = None,
) -> nx.Graph:
    """Build a NetworkX graph from extracted concepts."""
    graph = nx.Graph()
    freshness_lookup = freshness_map or {}

    for concept in concepts:
        name = concept.get('name', '').strip()
        if not name:
            continue

        _upsert_concept_node(
            graph,
            name=name,
            node_type=concept.get('type', 'concept'),
            description=concept.get('description', ''),
            book_id=book_id,
            freshness=freshness_lookup.get(name, 1.0),
        )

        for raw_related in concept.get('related', []):
            related_name = raw_related.strip()
            if not related_name or related_name == name:
                continue
            edge_label = _resolve_edge_label(concept, related_name)
            _add_related_edge(
                graph,
                source=name,
                target=related_name,
                edge_label=edge_label,
                book_id=book_id,
                freshness=freshness_lookup.get(related_name, 1.0),
            )

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
