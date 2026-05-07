"""Knowledge graph routes — graph data, concept search, and listing."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter
from app.models.book import Book
from app.schemas.knowledge import ConceptSearchResult, GraphData
from app.schemas.common import GenericResponse
from app.services.knowledge_service import (
    build_graph,
    get_concepts,
    search_concepts,
)

logger = logging.getLogger('read-pal.knowledge')

router = APIRouter(prefix='/api/v1/knowledge', tags=['knowledge'])


@router.get('/graph', response_model=GenericResponse)
async def get_all_graphs(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get all knowledge graphs for the user (cached only, no LLM calls)."""
    from app.services.knowledge_service import _load_cached_graph, _content_hash, _load_annotations

    result = await db.execute(
        select(Book.id).where(Book.user_id == UUID(current_user['id'])),
    )
    book_ids = [row[0] for row in result.all()]
    all_nodes: list[dict] = []
    all_edges: list[dict] = []

    uid = UUID(current_user['id'])
    for bid in book_ids:
        try:
            annotations = await _load_annotations(db, uid, bid)
            texts = [a.content for a in annotations if a.content.strip()]
            current_hash = _content_hash(texts)
            cached = await _load_cached_graph(uid, bid, current_hash)
            if cached is not None:
                for node in cached.nodes:
                    all_nodes.append(node.model_dump())
                for edge in cached.edges:
                    all_edges.append(edge.model_dump())
        except Exception:
            logger.warning('Failed to load cached graph for book %s', bid, exc_info=True)
            continue

    return {
        'success': True,
        'data': {
            'nodes': all_nodes,
            'edges': all_edges,
        },
    }


@router.get('/themes', response_model=GenericResponse)
async def get_themes(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get themes across all books."""
    return {
        'success': True,
        'data': {
            'themes': [],
            'connections': [],
        },
    }


@router.get('/graph/{book_id}', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def get_graph(
    book_id: UUID,
    force_rebuild: bool = Query(
        False,
        description='Force regeneration of the graph via LLM',
    ),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get knowledge graph data for a book."""
    graph_data = await build_graph(
        db,
        UUID(current_user['id']),
        book_id,
        force_rebuild=force_rebuild,
    )
    return {
        'success': True,
        'data': graph_data.model_dump(),
    }


@router.get('/search', response_model=GenericResponse)
async def search(
    q: str = Query(..., min_length=1, description='Search query'),
    book_id: UUID = Query(..., description='Book ID to search within'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search concepts in a book's knowledge graph."""
    results = await search_concepts(
        db,
        UUID(current_user['id']),
        book_id,
        q,
    )
    return {
        'success': True,
        'data': [r.model_dump() for r in results],
    }


@router.get('/concepts/{book_id}', response_model=GenericResponse)
async def list_concepts(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all concepts in a book's knowledge graph."""
    concepts = await get_concepts(db, UUID(current_user['id']), book_id)
    return {
        'success': True,
        'data': concepts,
    }
