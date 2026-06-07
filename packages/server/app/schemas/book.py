"""Pydantic v2 schemas for book endpoints."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class BookCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    cover_url: str | None = None
    file_type: Literal['epub', 'pdf']
    file_size: int = Field(gt=0)
    total_pages: int = 0
    tags: list[str] = Field(default_factory=list, max_length=50)


class BookUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    title: str | None = Field(None, min_length=1, max_length=255)
    author: str | None = Field(None, min_length=1, max_length=255)
    cover_url: str | None = None
    current_page: int | None = Field(None, ge=0)
    current_segment: int | None = Field(None, ge=0)
    progress: Decimal | None = Field(None, ge=0, le=100)
    status: Literal['unread', 'reading', 'completed'] | None = None
    tags: list[str] | None = None


class BookResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    user_id: UUID
    title: str
    author: str
    cover_url: str | None
    file_type: str
    file_size: int
    total_pages: int
    current_page: int
    current_segment: int
    progress: Decimal
    status: str
    tags: list[str]
    added_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    last_read_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BookListResponse(BaseModel):
    success: bool = True
    data: list[BookResponse]
    total: int


class BookStatsData(BaseModel):
    total: int
    reading: int
    completed: int
    unread: int
    total_pages_read: int = Field(validation_alias='totalPagesRead', serialization_alias='totalPagesRead')

    model_config = ConfigDict(populate_by_name=True)


class BookStatsResponse(BaseModel):
    success: bool = True
    data: BookStatsData


class BookTagsUpdateRequest(BaseModel):
    """Request body for updating book tags."""

    tags: list[str] = Field(default_factory=list, max_length=50)


class SeedSampleBookRequest(BaseModel):
    """Request body for seeding a sample book."""

    title: str = Field(default='Sample Book', max_length=255)
    author: str = Field(default='Sample Author', max_length=255)
