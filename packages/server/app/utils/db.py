"""Shared database error handling utilities."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.exc import DBAPIError


@asynccontextmanager
async def db_error_guard(label: str, **context: object) -> AsyncIterator[None]:
    """Context manager that logs DBAPIError with structured context and re-raises.

    Usage::

        async with db_error_guard('get_annotations', user_id=user_id):
            result = await db.execute(query)
    """
    try:
        yield
    except DBAPIError:
        logger = logging.getLogger('read-pal.db')
        logger.error('%s failed', label, exc_info=True, **context)
        raise
