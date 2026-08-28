"""Shared utility helpers."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return current UTC time as a naive datetime.

    PostgreSQL columns are TIMESTAMP WITHOUT TIME ZONE, so all Python
    datetimes passed to queries must be timezone-naive to avoid
    asyncpg ``can't subtract offset-naive and offset-aware datetimes`` errors.
    """
    return datetime.now(UTC).replace(tzinfo=None)
