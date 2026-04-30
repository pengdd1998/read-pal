"""Pydantic schemas for intervention endpoints."""

from typing import Any

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class InterventionCheckRequest(BaseModel):
    """Request body for checking if an intervention is needed."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID | None = None
    bookId: str | None = None


class InterventionFeedbackRequest(BaseModel):
    """Request body for submitting intervention feedback."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    type: str = Field(default='', max_length=50)
    helpful: bool = False
    dismissed: bool = False
    book_id: UUID | None = None
    bookId: str | None = None
    context: Any = None
