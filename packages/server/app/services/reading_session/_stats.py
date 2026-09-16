"""Reading session statistics with Redis caching."""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reading_session import ReadingSession

logger = logging.getLogger('read-pal.sessions')


def _stats_cache_key(uid: str) -> str:
    return f'stats:sessions:{uid}'


async def _try_cache_read(user_id: str) -> dict | None:
    """Attempt to read stats from Redis cache. Returns None on miss or error."""
    from app.core.cache import cache_get
    return await cache_get(_stats_cache_key(user_id))


async def _try_cache_write(user_id: str, data: dict) -> None:
    """Attempt to write stats to Redis cache. Silently ignores errors."""
    from app.core.cache import cache_set
    await cache_set(_stats_cache_key(user_id), data)


async def _query_session_stats(db: AsyncSession, user_id: str) -> dict:
    """Run aggregate stats query and return result dict."""
    row = (
        await db.execute(
            select(
                func.count().label('sessions'),
                func.coalesce(func.sum(ReadingSession.duration), 0).label('duration'),
                func.coalesce(func.sum(ReadingSession.pages_read), 0).label('pages'),
                func.coalesce(func.sum(ReadingSession.highlights), 0).label('highlights'),
                func.coalesce(func.sum(ReadingSession.notes), 0).label('notes'),
            ).where(ReadingSession.user_id == user_id)
        )
    ).one()
    return {
        'totalSessions': int(row.sessions),
        'totalDuration': int(row.duration),
        'totalPagesRead': int(row.pages),
        'totalHighlights': int(row.highlights),
        'totalNotes': int(row.notes),
    }


async def get_session_stats(db: AsyncSession, user_id: str) -> dict:
    """Return aggregate reading session statistics (cached 5 min, single query)."""
    cached = await _try_cache_read(user_id)
    if cached:
        return cached

    result = await _query_session_stats(db, user_id)
    await _try_cache_write(user_id, result)
    return result
