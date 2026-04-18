"""Challenges routes — reading challenge tracking."""

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user

router = APIRouter(prefix='/api/v1/challenges', tags=['challenges'])


@router.get('/')
async def list_challenges(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return empty challenges list."""
    return {
        'success': True,
        'data': [],
    }
