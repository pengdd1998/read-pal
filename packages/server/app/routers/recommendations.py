"""Recommendations routes — book recommendations."""

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user

router = APIRouter(prefix='/api/v1/recommendations', tags=['recommendations'])


@router.get('/')
async def list_recommendations(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return empty recommendations list."""
    return {
        'success': True,
        'data': [],
    }
