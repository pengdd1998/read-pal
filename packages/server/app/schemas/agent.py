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


class AIFeedbackRequest(BaseModel):
    """Request body for AI response feedback."""

    book_id: UUID
    message_id: str | None = None
    rating: bool  # True=thumbs up, False=thumbs down
    comment: str | None = None


class ReadingPlanRequest(BaseModel):
    """Request body for generating a reading plan."""

    book_id: UUID
    total_days: int = Field(default=7, ge=1, le=90)
    daily_minutes: int = Field(default=30, ge=10, le=240)


class ReadingPlanResponse(BaseModel):
    """Response for reading plan."""

    success: bool = True
    data: dict


class CompanionModeRequest(BaseModel):
    """Request body for setting companion mode."""

    mode: Literal['casual', 'scholar', 'socratic']
