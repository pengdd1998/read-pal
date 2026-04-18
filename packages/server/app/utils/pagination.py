"""Pagination utility."""

from math import ceil
from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar('T')

DEFAULT_PAGE = 1
DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


async def paginate(
    db: AsyncSession,
    query: Select,
    page: int = DEFAULT_PAGE,
    per_page: int = DEFAULT_PER_PAGE,
) -> tuple[list[Any], int]:
    """Paginate a SQLAlchemy query.

    Returns (items, total_count).
    """
    per_page = min(per_page, MAX_PER_PAGE)
    page = max(page, 1)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    result = await db.execute(count_query)
    total = result.scalar() or 0

    # Get page of items
    offset = (page - 1) * per_page
    result = await db.execute(query.offset(offset).limit(per_page))
    items = list(result.scalars().all())

    return items, total


def pagination_meta(
    total: int,
    page: int,
    per_page: int,
) -> dict[str, Any]:
    """Build pagination metadata for response."""
    return {
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': ceil(total / per_page) if total > 0 else 0,
        'has_next': page * per_page < total,
        'has_prev': page > 1,
    }
