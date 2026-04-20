"""Pydantic v2 schemas for annotation endpoints."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AnnotationCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    type: Literal['highlight', 'note', 'bookmark']
    location: dict
    content: str = Field(min_length=1)
    color: str | None = Field(None, max_length=7)
    note: str | None = None
    tags: list[str] = []


class AnnotationUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    content: str | None = Field(None, min_length=1)
    color: str | None = Field(None, max_length=7)
    note: str | None = None
    tags: list[str] | None = None


class AnnotationResponse(BaseModel):
    id: UUID
    user_id: UUID
    book_id: UUID
    type: str
    location: dict
    content: str
    color: str | None
    note: str | None
    tags: list[str] | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnotationListResponse(BaseModel):
    success: bool = True
    data: list[AnnotationResponse]
    total: int


class ChapterStatsResponse(BaseModel):
    success: bool = True
    data: list[dict]  # [{chapter, count, types: {highlight, note, bookmark}}]
