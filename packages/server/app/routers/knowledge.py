"""Knowledge graph routes — graph data, concept search, and listing."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter, api_limiter
from app.schemas.common import GenericResponse
from app.services.knowledge_service import (
    build_graph,
    detect_gaps,
    get_all_cached_graphs,
    get_concepts,
    get_cross_book_themes,
    search_concepts,
)
from app.utils.i18n import t

logger = logging.getLogger('read-pal.knowledge')

router = APIRouter(prefix='/api/v1/knowledge', tags=['knowledge'])


@router.get('/graph', response_model=GenericResponse, dependencies=[api_limiter])
async def get_all_graphs(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get all knowledge graphs for the user (cached only, no LLM calls)."""
    data = await get_all_cached_graphs(db, UUID(current_user['id']))
    return {'success': True, 'data': data}


@router.get('/themes', response_model=GenericResponse)
async def get_themes(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get themes across all books."""
    themes = await get_cross_book_themes(db, UUID(current_user['id']))
    return {'success': True, 'data': themes}


@router.get('/graph/{book_id}', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def get_graph(
    book_id: UUID,
    force_rebuild: bool = Query(False, description='Force regeneration via LLM'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get knowledge graph data for a book."""
    try:
        graph_data = await build_graph(
            db, UUID(current_user['id']), book_id, force_rebuild=force_rebuild,
        )
    except (ConnectionError, TimeoutError) as exc:
        logger.error('Knowledge graph build failed: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_unavailable')},
        ) from exc
    return {'success': True, 'data': graph_data.model_dump(by_alias=True, mode='json')}


@router.get('/search', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def search(
    q: str = Query(..., min_length=1, description='Search query'),
    book_id: UUID = Query(..., description='Book ID to search within'),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Search concepts in a book's knowledge graph."""
    results = await search_concepts(db, UUID(current_user['id']), book_id, q)
    return {'success': True, 'data': [r.model_dump() for r in results]}  # ConceptSearchResult has no snake_case fields


@router.get('/concepts/{book_id}', response_model=GenericResponse)
async def list_concepts(
    book_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all concepts in a book's knowledge graph."""
    concepts = await get_concepts(db, UUID(current_user['id']), book_id)
    return {'success': True, 'data': concepts}


@router.get('/gaps', response_model=GenericResponse)
async def get_knowledge_gaps(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Detect knowledge gaps in the user's combined knowledge graph."""
    try:
        gaps = await detect_gaps(db, UUID(current_user['id']))
    except (ConnectionError, TimeoutError) as exc:
        logger.error('Knowledge gaps detection failed: %s', exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={'code': 'AI_UNAVAILABLE', 'message': t('errors.ai_unavailable')},
        ) from exc
    return {'success': True, 'data': {'gaps': [g.model_dump(by_alias=True, mode='json') for g in gaps]}}
