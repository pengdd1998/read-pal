import logging
import os
from collections.abc import AsyncGenerator
from contextlib import suppress

from sqlalchemy.exc import DBAPIError, InterfaceError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger('read-pal.db')

settings = get_settings()

# Pool sizing is env-tunable: DB connections to the remote Postgres are
# expensive (network RTT + server-side backend per connection). Defaults:
# 2 workers × (20+10) = up to 60 connections — sized for max_connections=100.
def _pool_config_from_env(environ: 'dict[str, str] | os._Environ' = os.environ) -> tuple[int, int, int, int]:
    """Parse pool knobs: (pool_size, max_overflow, recycle, timeout)."""
    return (
        int(environ.get('DB_POOL_SIZE', '20')),
        int(environ.get('DB_MAX_OVERFLOW', '10')),
        int(environ.get('DB_POOL_RECYCLE', '1800')),
        int(environ.get('DB_POOL_TIMEOUT', '30')),
    )


_db_pool_size, _db_max_overflow, _db_pool_recycle, _db_pool_timeout = _pool_config_from_env()

engine = create_async_engine(
    settings.database_url,
    echo=settings.is_dev,
    pool_size=_db_pool_size,
    max_overflow=_db_max_overflow,
    # Remote DB behind NAT — idle connections get silently dropped by
    # middleboxes; recycle proactively at 30min instead of 1h.
    pool_recycle=_db_pool_recycle,
    pool_timeout=_db_pool_timeout,
    pool_pre_ping=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def release_db(db: AsyncSession) -> None:
    """Return the session's connection to the pool before a long await.

    SQLAlchemy autobegin opens a transaction on the first execute and holds
    the connection until commit/rollback. Services that call the LLM between
    a read and a write otherwise pin a Postgres backend (idle-in-transaction)
    for the entire LLM round-trip (up to ~120s with retries) — the most
    expensive way to hold a connection.

    Call ``await release_db(db)`` immediately before long LLM awaits:
    any pending read transaction is committed (reads only — safe), the
    connection returns to the pool, and the next execute transparently
    checks out a fresh one.
    """
    try:
        # bool() coercion: AsyncMock spec returns a MagicMock sentinel —
        # treat anything truthy as in-transaction.
        in_txn = bool(db.in_transaction()) if hasattr(db, 'in_transaction') else True
        if in_txn:
            await db.commit()
    except (DBAPIError, InterfaceError, OSError, RuntimeError) as exc:
        # A failing read-commit means the transaction was already broken;
        # roll back so the session is reusable and re-raise nothing — the
        # following LLM call does not depend on it.
        with suppress(Exception):
            await db.rollback()
        logger.warning('db.release_commit_failed rolled_back error=%s', str(exc)[:200])
    except Exception as exc:
        # Non-DB errors (mock objects in tests, exotic session wrappers) —
        # release must never break the caller; log and move on.
        logger.debug('db.release_skipped error=%s', str(exc)[:120])


def pool_status() -> dict[str, int | str]:
    """Snapshot pool utilization for /health — makes exhaustion observable."""
    pool = engine.pool
    try:
        return {
            'size': pool.size(),
            'checked_in': pool.checkedin(),
            'checked_out': pool.checkedout(),
            'overflow': pool.overflow(),
            'invalid': pool.status().split(',')[-1].strip() if hasattr(pool, 'status') else 'n/a',
        }
    except Exception:  # pool API differences across SQLAlchemy versions
        return {'status': 'unavailable'}


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except DBAPIError:
            await session.rollback()
            raise
        except InterfaceError as exc:
            # Streaming responses: the SSE generator and this teardown share
            # one asyncpg connection. If the generator's persist is still
            # in flight when teardown fires, the commit can fail with
            # "another operation is in progress". The generator owns its
            # own commits/rollbacks for stream persistence, so a failed
            # teardown commit here loses nothing — roll back and log
            # instead of turning a completed stream into a 500.
            logger.warning(
                'db.teardown_commit_race session_closing_anyway error=%s',
                str(exc)[:200],
            )
            with suppress(Exception):
                await session.rollback()
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables from models. Used in development only."""
    # Import all models so they register with Base.metadata
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
