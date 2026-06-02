"""Common shared schemas."""

from typing import Any

from pydantic import BaseModel


class GenericResponse(BaseModel):
    """Generic success response for endpoints without a specific response model."""

    success: bool = True
    data: Any = None


def paginate(
    items: list,
    total: int,
    page: int,
    per_page: int,
    **extra: Any,
) -> dict[str, Any]:
    """Build a standardized paginated response data dict."""
    result: dict[str, Any] = {
        'items': items,
        'total': total,
        'page': page,
        'per_page': per_page,
    }
    result.update(extra)
    return result
