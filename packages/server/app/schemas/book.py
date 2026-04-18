"""Pydantic v2 schemas for book endpoints."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=255)
    cover_url: str | None = None
    file_type: Literal['epub', 'pdf']
    file_size: int = Field(gt=0)
    total_pages: int = 0
    tags: list[str] = []


class BookUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    author: str | None = Field(None, min_length=1, max_length=255)
    cover_url: str | None = None
    current_page: int | None = Field(None, ge=0)
    progress: Decimal | None = Field(None, ge=0, le=100)
    status: Literal['unread', 'reading', 'completed'] | None = None
    tags: list[str] | None = None


class BookResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    author: str
    cover_url: str | None
    file_type: str
    file_size: int
    total_pages: int
    current_page: int
    progress: Decimal
    status: str
    tags: list[str]
    added_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    last_read_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookListResponse(BaseModel):
    success: bool = True
    data: list[BookResponse]
    total: int


class BookStatsResponse(BaseModel):
    success: bool = True
    data: dict  # {total, reading, completed, unread, total_pages_read}
