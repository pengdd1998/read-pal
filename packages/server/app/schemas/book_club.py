"""Pydantic v2 schemas for book club endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BookClubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    cover_image: str | None = None
    is_private: bool = False
    max_members: int = Field(default=20, ge=2, le=100)


class BookClubUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    cover_image: str | None = None
    current_book_id: UUID | None = None
    is_private: bool | None = None
    max_members: int | None = Field(None, ge=2, le=100)


class BookClubResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    cover_image: str | None
    created_by: UUID
    current_book_id: UUID | None
    is_private: bool
    invite_code: str
    max_members: int
    member_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}


class ClubJoinRequest(BaseModel):
    invite_code: str


class DiscussionCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class DiscussionResponse(BaseModel):
    id: UUID
    club_id: UUID
    user_id: UUID
    content: str
    created_at: datetime

    model_config = {'from_attributes': True}


class MemberResponse(BaseModel):
    id: UUID
    club_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    user_name: str | None = None

    model_config = {'from_attributes': True}
