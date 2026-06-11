"""Background tasks that run during the application lifespan."""

import asyncio
from datetime import timedelta

import structlog
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError

from app.config import get_settings
from app.db import async_session
from app.utils import utcnow

logger = structlog.get_logger('read-pal')
settings = get_settings()

_LOG_CLEANUP_INTERVAL = 86400  # 24 hours
_STALE_SESSION_CHECK_INTERVAL = 7200  # 2 hours
_MAX_SESSION_SECONDS = 43200  # 12 hours


async def log_cleanup_loop() -> None:
    """Periodically clean up old LLM logs."""
    try:
        from app.services.llm_log_service import cleanup_old_logs
    except ImportError:
        logger.info('log_cleanup_skipped_no_module')
        return
    while True:
        await asyncio.sleep(_LOG_CLEANUP_INTERVAL)
        try:
            async with async_session() as db:
                deleted = await cleanup_old_logs(db, settings.llm_log_retention_days)
                if deleted:
                    logger.info('cleaned_up_llm_logs', deleted=deleted, retention_days=settings.llm_log_retention_days)
        except DBAPIError as exc:
            logger.warning('llm_log_cleanup_failed', error=str(exc))


async def stale_session_cleanup_loop() -> None:
    """Finalize orphaned reading sessions."""
    while True:
        await asyncio.sleep(_STALE_SESSION_CHECK_INTERVAL)
        try:
            from app.models.reading_session import ReadingSession
            cutoff = utcnow() - timedelta(hours=2)
            async with async_session() as db:
                result = await db.execute(
                    select(ReadingSession).where(
                        ReadingSession.is_active.is_(True),
                        ReadingSession.updated_at < cutoff,
                    ),
                )
                now = utcnow()
                closed = 0
                for session in result.scalars().all():
                    session.is_active = False
                    session.ended_at = now
                    if not session.duration and session.started_at:
                        raw_dur = int((now - session.started_at).total_seconds())
                        session.duration = min(raw_dur, _MAX_SESSION_SECONDS)
                    closed += 1
                if closed:
                    await db.commit()
                    logger.info('closed_stale_sessions', count=closed)
        except DBAPIError as exc:
            logger.warning('stale_session_cleanup_failed', error=str(exc))


async def fix_absurd_session_durations() -> None:
    """One-time startup fix: cap sessions with durations > 12h."""
    MAX_SESSION_SECONDS = _MAX_SESSION_SECONDS
    try:
        from app.models.reading_session import ReadingSession
        async with async_session() as db:
            result = await db.execute(
                select(ReadingSession).where(
                    ReadingSession.duration > MAX_SESSION_SECONDS,
                ),
            )
            fixed = 0
            for session in result.scalars().all():
                session.duration = MAX_SESSION_SECONDS
                fixed += 1
            if fixed:
                await db.commit()
                logger.info('fixed_absurd_durations', count=fixed)
    except DBAPIError as exc:
        logger.warning('fix_absurd_durations_failed', error=str(exc))
