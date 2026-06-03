"""Pydantic v2 schemas for shared export endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ShareCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    format: str = Field(max_length=20)
    title: str = Field(min_length=1, max_length=500)
    content_type: str = Field(default='text/markdown; charset=utf-8', max_length=100)
    expires_at: datetime | None = None


class ShareResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    user_id: UUID
    book_id: UUID
    token: str
    format: str
    title: str
    content_type: str
    view_count: int
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    share_url: str | None = None
