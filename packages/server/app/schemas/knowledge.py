"""Pydantic schemas for knowledge graph endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    """A single node in the knowledge graph."""

    id: str
    label: str
    type: str  # 'concept', 'character', 'theme', 'location'
    size: int = 1
    metadata: dict = {}
    description: str = ''
    source_book_ids: list[str] = Field(default_factory=list)
    annotation_count: int = 0
    freshness: float = Field(default=1.0, ge=0.0, le=1.0)


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


class KnowledgeGap(BaseModel):
    """A detected gap in the user's knowledge graph."""

    concept: str
    reason: str
    suggestion: str
    suggested_action: str = ''
    connected_clusters: int = 0
