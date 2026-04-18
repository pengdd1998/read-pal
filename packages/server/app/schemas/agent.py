"""Pydantic schemas for agent and friend endpoints."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Request body for the reading companion chat."""

    book_id: UUID
    message: str = Field(min_length=1, max_length=4000)
    context: dict | None = None


class ChatResponse(BaseModel):
    """Standard response for chat endpoints."""

    success: bool = True
    data: dict  # {role: 'assistant', content: str}


class FriendChatRequest(BaseModel):
    """Request body for the reading friend chat."""

    persona: Literal['sage', 'penny', 'alex', 'quinn', 'sam']
    message: str = Field(min_length=1, max_length=4000)
    book_id: UUID | None = None


class SummarizeRequest(BaseModel):
    """Request body for book or chapter summarization."""

    book_id: UUID
    chapter_ids: list[str] | None = None


class ExplainRequest(BaseModel):
    """Request body for passage explanation."""

    book_id: UUID
    text: str = Field(min_length=1)
    context: str | None = None
