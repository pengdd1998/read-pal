"""Challenges routes — reading challenge tracking.

Generates personalised challenges based on the user's current reading stats.
No LLM/AI calls — progress is computed directly from the database.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.services.challenge_service import get_all_challenges

router = APIRouter(prefix='/api/v1/challenges', tags=['challenges'])


@router.get('', response_model=GenericResponse)
async def list_challenges(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return personalised reading challenges based on current stats."""
    user_id = UUID(current_user['id'])
    challenges = await get_all_challenges(db, user_id)
    return {
        'success': True,
        'data': {'challenges': challenges},
    }
