"""Pydantic v2 schemas for shared export endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ShareCreate(BaseModel):
    book_id: UUID
    format: str
    title: str
    content_type: str = 'text/markdown; charset=utf-8'
    expires_at: datetime | None = None


class ShareResponse(BaseModel):
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

    model_config = {'from_attributes': True}
