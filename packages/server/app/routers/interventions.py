"""Intervention routes — reading interruption checks and feedback."""

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user

router = APIRouter(prefix='/api/v1/interventions', tags=['interventions'])


@router.post('/check')
async def check_intervention(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Check if a reading intervention is needed."""
    return {
        'success': True,
        'data': {
            'interventionNeeded': False,
            'type': None,
            'message': None,
        },
    }


@router.post('/feedback')
async def submit_feedback(
    body: dict,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Accept intervention feedback."""
    return {
        'success': True,
        'data': {'message': 'Feedback recorded'},
    }
