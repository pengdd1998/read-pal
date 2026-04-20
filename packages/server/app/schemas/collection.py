"""Pydantic v2 schemas for collection endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CollectionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    icon: str | None = None
    color: str | None = None


class CollectionUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    icon: str | None = None
    color: str | None = None
    book_ids: list[UUID] | None = None


class CollectionResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: str | None
    icon: str
    color: str
    book_ids: list[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
