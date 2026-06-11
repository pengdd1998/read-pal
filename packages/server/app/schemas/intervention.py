"""Pydantic schemas for intervention endpoints."""

from typing import Any

from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class InterventionCheckRequest(BaseModel):
    """Request body for checking if an intervention is needed."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID | None = Field(
        None, validation_alias=AliasChoices('book_id', 'bookId'),
    )


class InterventionFeedbackRequest(BaseModel):
    """Request body for submitting intervention feedback."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    type: str = Field(default='', max_length=50)
    helpful: bool = False
    dismissed: bool = False
    book_id: UUID | None = Field(
        None, validation_alias=AliasChoices('book_id', 'bookId'),
    )
    context: dict[str, Any] | None = None


class InterventionPreferencesRequest(BaseModel):
    """Request body for updating intervention preferences."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    marathon_enabled: bool | None = None
    long_session_enabled: bool | None = None
    low_engagement_enabled: bool | None = None
    welcome_back_enabled: bool | None = None
    speed_drop_enabled: bool | None = None
    re_reading_enabled: bool | None = None
    optimal_timing_enabled: bool | None = None
    quiet_hours_start: int | None = Field(None, ge=0, le=23)
    quiet_hours_end: int | None = Field(None, ge=0, le=23)
