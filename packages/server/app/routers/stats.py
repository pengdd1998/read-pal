"""Statistics routes — dashboard, calendar, reading speed."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.middleware.auth import get_current_user
from app.services import stats_service

router = APIRouter(prefix='/api/v1/stats', tags=['stats'])


def _user_id(current_user: dict) -> UUID:
    """Extract UUID from the current_user dict."""
    return UUID(current_user['id'])


@router.get('/dashboard')
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return dashboard data matching the nested shape the frontend expects."""
    uid = _user_id(current_user)
    data = await stats_service.get_dashboard_stats(db, uid)
    return {'success': True, 'data': data}


@router.get('/reading-calendar')
async def get_reading_calendar(
    months: int | None = Query(None),
    year: int | None = Query(None),
    month: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return calendar data: days with reading activity."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_calendar(db, uid, months, year, month)
    return {'success': True, 'data': data}


@router.get('/reading-speed')
async def get_reading_speed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats aggregated from sessions."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_speed(db, uid)
    return {'success': True, 'data': data}


@router.get('/reading-speed/by-book')
async def get_reading_speed_by_book(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return reading speed stats grouped by book."""
    uid = _user_id(current_user)
    data = await stats_service.get_reading_speed_by_book(db, uid)
    return {'success': True, 'data': data}
