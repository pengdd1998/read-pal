"""Intervention routes — reading interruption checks and feedback.

Route handlers are thin wrappers that parse input, delegate to
``app.services.intervention_service``, and return responses.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.middleware.rate_limiter import api_limiter, write_limiter
from app.schemas.common import GenericResponse
from app.schemas.intervention import (
    InterventionCheckRequest,
    InterventionFeedbackRequest,
    InterventionPreferencesRequest,
)
from app.services.intervention_service import (
    analyze_reading_pattern,
    get_feedback_history,
    get_preferences,
    store_feedback,
    update_preferences,
)

router = APIRouter(
    prefix='/api/v1/interventions',
    tags=['interventions'],
    dependencies=[api_limiter],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post('/check', response_model=GenericResponse, dependencies=[write_limiter])
async def check_intervention(
    body: InterventionCheckRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if a reading intervention is needed based on reading patterns."""
    user_id = UUID(current_user['id'])
    book_id = body.book_id
    book_uuid = UUID(str(book_id)) if book_id else None

    intervention = await analyze_reading_pattern(db, user_id, book_uuid)

    if intervention:
        return {'success': True, 'data': intervention}

    return {
        'success': True,
        'data': {
            'interventionNeeded': False,
            'type': None,
            'priority': None,
            'message': None,
        },
    }


@router.post('/feedback', response_model=GenericResponse, dependencies=[write_limiter])
async def submit_feedback(
    body: InterventionFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Store intervention feedback."""
    user_id = UUID(current_user['id'])
    book_id = body.book_id

    result = await store_feedback(
        db=db,
        user_id=user_id,
        book_id=UUID(str(book_id)) if book_id else None,
        intervention_type=body.type,
        helpful=body.helpful,
        dismissed=body.dismissed,
        context=body.context,
    )
    return {'success': True, 'data': result}


@router.get('/history', response_model=GenericResponse)
async def get_intervention_history(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the last 20 intervention feedback records for the current user."""
    user_id = UUID(current_user['id'])
    history = await get_feedback_history(db, user_id)
    return {'success': True, 'data': history}


@router.get('/preferences', response_model=GenericResponse)
async def get_intervention_preferences(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the user's intervention preferences (or defaults)."""
    user_id = UUID(current_user['id'])
    prefs = await get_preferences(user_id)
    return {'success': True, 'data': prefs}


@router.put('/preferences', response_model=GenericResponse, dependencies=[write_limiter])
async def update_intervention_preferences(
    body: InterventionPreferencesRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Store the user's intervention preferences in Redis."""
    user_id = UUID(current_user['id'])
    prefs = await update_preferences(user_id, body)
    return {'success': True, 'data': prefs}
