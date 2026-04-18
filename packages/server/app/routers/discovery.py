"""Discovery routes — search, semantic search, free books."""

from fastapi import APIRouter, Depends, Query

from app.middleware.auth import get_current_user

router = APIRouter(prefix='/api/v1/discovery', tags=['discovery'])


@router.get('/search')
async def search(
    q: str = Query('', max_length=200),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return empty search results."""
    return {
        'success': True,
        'data': {
            'items': [],
            'total': 0,
            'query': q,
        },
    }


@router.get('/semantic')
async def semantic_search(
    q: str = Query('', max_length=200),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return empty semantic search results."""
    return {
        'success': True,
        'data': {
            'items': [],
            'total': 0,
            'query': q,
        },
    }


@router.get('/free-books')
async def get_free_books(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return sample free books list."""
    return {
        'success': True,
        'data': {
            'items': [],
            'total': 0,
        },
    }
