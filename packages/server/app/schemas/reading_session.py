"""Pydantic v2 schemas for reading session endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SessionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    started_at: datetime | None = None


class SessionUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    ended_at: datetime | None = None
    duration: int | None = Field(None, ge=0)
    pages_read: int | None = Field(None, ge=0)
    highlights: int | None = Field(None, ge=0)
    notes: int | None = Field(None, ge=0)
    summary: str | None = None
    is_active: bool | None = None
    current_page: int | None = Field(None, ge=0)
    total_pages: int | None = Field(None, ge=0)


class SessionResponse(BaseModel):
    id: UUID
    user_id: UUID
    book_id: UUID
    started_at: datetime
    ended_at: datetime | None
    duration: int
    pages_read: int
    highlights: int
    notes: int
    summary: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionListResponse(BaseModel):
    success: bool = True
    data: list[SessionResponse]
    total: int


class SessionStatsResponse(BaseModel):
    success: bool = True
    data: dict  # {total_sessions, total_duration, total_pages_read, ...}
