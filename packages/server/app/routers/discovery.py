"""Discovery routes — search, semantic search, free books."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import ai_heavy_limiter, api_limiter
from app.schemas.common import GenericResponse
from app.services.discovery_service import (
    get_free_books,
    search_books,
    semantic_search_books,
)

router = APIRouter(prefix='/api/v1/discovery', tags=['discovery'])


@router.get('/search', response_model=GenericResponse, dependencies=[api_limiter])
async def search(
    q: str = Query('', max_length=200),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Full-text search across the user's books."""
    user_id = UUID(current_user['id'])
    items, total = await search_books(db, user_id, q, page, limit)
    return {
        'success': True,
        'data': {
            'items': items,
            'total': total,
            'query': q,
            'page': page,
            'limit': limit,
        },
    }


@router.get('/semantic', response_model=GenericResponse, dependencies=[ai_heavy_limiter])
async def semantic_search(
    q: str = Query('', max_length=200),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Semantic-style search across books and annotations."""
    user_id = UUID(current_user['id'])
    items, total = await semantic_search_books(db, user_id, q, page, limit)
    return {
        'success': True,
        'data': {
            'items': items,
            'total': total,
            'query': q,
            'page': page,
            'limit': limit,
        },
    }


@router.get('/free-books', response_model=GenericResponse, dependencies=[api_limiter])
async def get_free_books_endpoint(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return community picks — popular completed books across all users."""
    items = await get_free_books(db)
    return {
        'success': True,
        'data': {
            'items': items,
            'total': len(items),
        },
    }
