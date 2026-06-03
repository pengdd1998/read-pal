"""Pydantic v2 schemas for notification endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class NotificationResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    user_id: UUID
    type: str
    title: str
    message: str
    metadata_: dict | None = Field(None, serialization_alias='metadata')
    read: bool
    created_at: datetime
    updated_at: datetime


class NotificationUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    read: bool
