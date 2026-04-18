"""Knowledge graph routes — graph data, concept search, and listing."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.knowledge import ConceptSearchResult, GraphData
from app.services.knowledge_service import (
    build_graph,
    get_concepts,
    search_concepts,
)

logger = logging.getLogger('read-pal.knowledge')

router = APIRouter(prefix='/api/v1/knowledge', tags=['knowledge'])


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
