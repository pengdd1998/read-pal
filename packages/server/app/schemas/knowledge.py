"""Pydantic schemas for knowledge graph endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class GraphNode(BaseModel):
    """A single node in the knowledge graph."""

    id: str
    label: str
    type: str  # 'concept', 'character', 'theme', 'location'
    size: int = 1
    metadata: dict = {}


class GraphEdge(BaseModel):
    """An edge connecting two nodes in the knowledge graph."""

    source: str
    target: str
    label: str = ''
    weight: float = 1.0


class GraphData(BaseModel):
    """Full graph payload for frontend SVG rendering."""

    nodes: list[GraphNode]
    edges: list[GraphEdge]


class ConceptSearchResult(BaseModel):
    """A concept matched by a search query."""

    concept: str
    relevance: float
    related: list[str]
    mentions: int
