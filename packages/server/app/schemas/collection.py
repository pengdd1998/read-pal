"""Pydantic v2 schemas for collection endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    icon: str | None = None
    color: str | None = None


class CollectionUpdate(BaseModel):
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

    model_config = {'from_attributes': True}
