"""Dashboard stats with Redis caching.

Public API:
    - get_dashboard_stats(db, uid) -> dict
    - invalidate_dashboard_cache(uid) -> None
"""

import asyncio
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.stats.dashboard_cache import (
    invalidate as _cache_invalidate,
    read_cache,
    read_stale,
    release_refresh_lock,
    try_acquire_refresh_lock,
    write_cache,
    write_stale,
)
from app.services.stats.dashboard_queries import (
    get_annotation_counts,
    get_book_status_counts,
    get_chat_count,
    get_distinct_tag_count,
    get_memory_book_count,
    get_pages_read,
    get_recent_books,
    get_reading_minutes,
    get_weekly_activity,
    compute_current_streak,
)

logger = logging.getLogger(__name__)

# Re-export for backward compatibility
invalidate_dashboard_cache = _cache_invalidate


def _format_time(minutes: int) -> str:
    """Format minutes as 'Xh Ym' or 'Ym'."""
    hours = minutes // 60
    mins = minutes % 60
    return f'{hours}h {mins}m' if hours > 0 else f'{mins}m'


def _safe_default(exc: Exception, fallback: object = 0) -> object:
    """Log a partial-dashboard failure and return a safe default."""
    logger.warning('Dashboard partial query failed: %s', str(exc)[:200])
    return fallback


async def _gather_raw_data(db: AsyncSession, uid: UUID) -> dict:
    """Collect all raw data from DB helpers.

    SEQUENTIAL by design: AsyncSession forbids concurrent operations, and
    the previous asyncio.gather over these ten helpers raced the session's
    first connection checkout — "concurrent operations are not permitted"
    (27× observed in local logs) with return_exceptions swallowing the
    failures into safe defaults, so a cold-cache dashboard could aggregate
    zeros AND cache that degraded payload via SWR. Each helper is a
    millisecond-scale query; the parallelism wasn't buying anything.
    Per-item failures still degrade individually.
    """
    async def _safe(coro_factory, default: object = 0) -> object:
        try:
            return await coro_factory()
        except Exception as exc:  # noqa: BLE001 — one section must not sink the rest
            return _safe_default(exc, default)

    status_counts = await _safe(lambda: get_book_status_counts(db, uid), {'total': 0, 'reading': 0, 'completed': 0, 'unread': 0})
    pages_read = int(await _safe(lambda: get_pages_read(db, uid)))
    total_minutes = int(await _safe(lambda: get_reading_minutes(db, uid)))
    streak = int(await _safe(lambda: compute_current_streak(db, uid)))
    annotation_pair = await _safe(lambda: get_annotation_counts(db, uid), (0, 0))
    highlights, notes = annotation_pair if isinstance(annotation_pair, tuple) else (0, 0)
    recent_books = await _safe(lambda: get_recent_books(db, uid), [])
    weekly_activity = await _safe(lambda: get_weekly_activity(db, uid), [])
    chat_count = int(await _safe(lambda: get_chat_count(db, uid)))
    memory_count = int(await _safe(lambda: get_memory_book_count(db, uid)))
    distinct_tags = int(await _safe(lambda: get_distinct_tag_count(db, uid)))

    return {
        'status_counts': status_counts,
        'pages_read': pages_read,
        'total_minutes': total_minutes,
        'streak': streak,
        'highlights': highlights,
        'notes': notes,
        'recent_books': recent_books,
        'weekly_activity': weekly_activity,
        'chat_count': chat_count,
        'memory_count': memory_count,
        'distinct_tags': distinct_tags,
    }


def _build_response(raw: dict) -> dict:
    """Assemble the nested response dict the frontend expects."""
    sc = raw['status_counts']
    stats = {
        'booksRead': sc['completed'],
        'totalPages': raw['pages_read'],
        'pagesRead': raw['pages_read'],
        'readingStreak': raw['streak'],
        'totalTime': _format_time(raw['total_minutes']),
        'conceptsLearned': raw['highlights'] + raw['notes'],
        'connections': raw['distinct_tags'],
        'chatMessageCount': raw['chat_count'],
        'memoryBookCount': raw['memory_count'],
    }
    return {
        'stats': stats,
        'recentBooks': raw['recent_books'],
        'weeklyActivity': raw['weekly_activity'],
        'booksByStatus': {
            'unread': sc['unread'],
            'reading': sc['reading'],
            'completed': sc['completed'],
        },
    }


async def get_dashboard_stats(db: AsyncSession, uid: UUID) -> dict:
    """Return dashboard data matching the nested shape the frontend expects.

    Response shape: ``{stats, recentBooks, weeklyActivity, booksByStatus}``

    Stale-while-revalidate: on TTL miss with a retained stale copy, the
    stale payload returns IMMEDIATELY (the cold aggregation measured 7-9s
    against a remote DB) and a single-flight background task recomputes.
    Use ``invalidate_dashboard_cache`` to force a refresh when underlying
    data changes.
    """
    cached = await read_cache(uid)
    if cached is not None:
        return cached

    stale = await read_stale(uid)
    if stale is not None and await try_acquire_refresh_lock(uid):
        # Hold the reference — an unreferenced task can be GC'd mid-flight
        # (24h-review risk 3b); discarded on completion to avoid buildup.
        task = asyncio.create_task(_refresh_dashboard(uid))
        _background_refreshes.add(task)
        task.add_done_callback(_background_refreshes.discard)

    if stale is not None:
        return stale

    raw = await _gather_raw_data(db, uid)
    result = _build_response(raw)
    await write_cache(uid, result)
    await write_stale(uid, result)
    return result


_background_refreshes: set[asyncio.Task] = set()


async def _refresh_dashboard(uid: UUID) -> None:
    """Recompute the dashboard off-request and repopulate both cache tiers."""
    from app.db import async_session

    try:
        async with async_session() as session:
            raw = await _gather_raw_data(session, uid)
        result = _build_response(raw)
        await write_cache(uid, result)
        await write_stale(uid, result)
    except Exception:  # noqa: BLE001 — refresh is best-effort; stale remains
        logger.warning('dashboard background refresh failed uid=%s', uid, exc_info=True)
    finally:
        await release_refresh_lock(uid)
