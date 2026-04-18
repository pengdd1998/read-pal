"""Statistics routes — dashboard, calendar, reading speed."""

from fastapi import APIRouter, Depends, Query

from app.middleware.auth import get_current_user

router = APIRouter(prefix='/api/v1/stats', tags=['stats'])


@router.get('/dashboard')
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return mock dashboard stats."""
    return {
        'success': True,
        'data': {
            'totalBooks': 0,
            'booksReading': 0,
            'booksCompleted': 0,
            'totalPagesRead': 0,
            'totalReadingTimeMinutes': 0,
            'currentStreak': 0,
            'longestStreak': 0,
            'totalHighlights': 0,
            'totalNotes': 0,
            'totalFlashcards': 0,
        },
    }


@router.get('/reading-calendar')
async def get_reading_calendar(
    year: int = Query(2026),
    month: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return mock calendar data."""
    return {
        'success': True,
        'data': {
            'days': {},
            'year': year,
            'month': month,
        },
    }


@router.get('/reading-speed')
async def get_reading_speed(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return mock reading speed data."""
    return {
        'success': True,
        'data': {
            'averagePagesPerHour': 0,
            'averageWordsPerMinute': 0,
            'speedOverTime': [],
        },
    }


@router.get('/reading-speed/by-book')
async def get_reading_speed_by_book(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return mock reading speed data per book."""
    return {
        'success': True,
        'data': [],
    }
