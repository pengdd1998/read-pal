"""Recommendations routes — deterministic book recommendations.

Scores a curated pool against the user's reading history (authors, genres/tags)
and returns the top 5 matches.  No LLM calls.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.services import recommendation_service

router = APIRouter(prefix='/api/v1/recommendations', tags=['recommendations'])


@router.get('', response_model=GenericResponse)
async def list_recommendations(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return book recommendations based on user reading history."""
    recommendations = await recommendation_service.get_recommendations(
        db, UUID(current_user['id']),
    )
    return {'success': True, 'data': {'recommendations': recommendations}}
