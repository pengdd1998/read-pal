"""Knowledge graph routes — graph data, concept search, and listing."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.models.book import Book
from app.schemas.knowledge import ConceptSearchResult, GraphData
from app.services.knowledge_service import (
    build_graph,
    get_concepts,
    search_concepts,
)

logger = logging.getLogger('read-pal.knowledge')

router = APIRouter(prefix='/api/v1/knowledge', tags=['knowledge'])


@router.get('/graph')
async def get_all_graphs(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get all knowledge graphs for the user (one per book)."""
    result = await db.execute(
        select(Book.id).where(Book.user_id == UUID(current_user['id'])),
    )
    book_ids = [row[0] for row in result.all()]
    graphs = []
    for bid in book_ids:
        try:
            graph_data = await build_graph(db, UUID(current_user['id']), bid)
            graphs.append(graph_data.model_dump())
        except Exception:
            continue
    return {'success': True, 'data': graphs}


@router.get('/themes')
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


@router.get('/graph/{book_id}')
async def get_graph(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get knowledge graph data for a book."""
    graph_data = await build_graph(db, UUID(current_user['id']), book_id)
    return {
        'success': True,
        'data': graph_data.model_dump(),
    }


@router.get('/search')
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


@router.get('/concepts/{book_id}')
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
