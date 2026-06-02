"""Statistics routes — dashboard, calendar, reading speed."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.schemas.common import GenericResponse
from app.services import stats_service

router = APIRouter(prefix='/api/v1/stats', tags=['stats'])


def _user_id(current_user: dict) -> UUID:
    """Extract UUID from the current_user dict."""
    return UUID(current_user['id'])


@router.get('/dashboard', response_model=GenericResponse)
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return dashboard data matching the nested shape the frontend expects."""
    uid = _user_id(current_user)
    data = await stats_service.get_dashboard_stats(db, uid)
    return {'success': True, 'data': data}


@router.get('/weekly-summary', response_model=GenericResponse)
async def get_weekly_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return weekly reading summary (Mon-Sun of the current week)."""
    uid = _user_id(current_user)
    data = await stats_service.get_weekly_summary(db, uid)
    return {'success': True, 'data': data}


@router.get('/reading-calendar', response_model=GenericResponse)
async def get_reading_calendar(
    months: int | None = Query(None, ge=1, le=24),
    year: int | None = Query(None, ge=2000, le=2100),
    month: int | None = Query(None, ge=1, le=12),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return calendar data: days with reading activity."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_calendar(db, uid, months, year, month)
    return {'success': True, 'data': data}


@router.get('/reading-speed', response_model=GenericResponse)
async def get_reading_speed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats aggregated from sessions."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_speed(db, uid)
    return {'success': True, 'data': data}


@router.get('/reading-speed/by-book', response_model=GenericResponse)
async def get_reading_speed_by_book(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats grouped by book."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_speed_by_book(db, uid)
    return {'success': True, 'data': data}


@router.get('/flashcards', response_model=GenericResponse)
async def get_flashcard_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return flashcard retention metrics for the current user."""
    uid = _user_id(current_user)
    data = await stats_service.get_flashcard_stats(db, uid)
    return {'success': True, 'data': data}
