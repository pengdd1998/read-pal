"""Common shared schemas."""

from typing import Any

from pydantic import BaseModel


class GenericResponse(BaseModel):
    """Generic success response for endpoints without a specific response model."""

    success: bool = True
    data: Any = None
