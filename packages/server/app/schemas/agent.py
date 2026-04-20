"""Pydantic schemas for agent and friend endpoints."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ChatRequest(BaseModel):
    """Request body for the reading companion chat."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    message: str = Field(min_length=1, max_length=4000)
    context: dict | None = None


class ChatResponse(BaseModel):
    """Standard response for chat endpoints."""

    success: bool = True
    data: dict  # {role: 'assistant', content: str}


class FriendChatRequest(BaseModel):
    """Request body for the reading friend chat."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    persona: Literal['sage', 'penny', 'alex', 'quinn', 'sam']
    message: str = Field(min_length=1, max_length=4000)
    book_id: UUID | None = None


class SummarizeRequest(BaseModel):
    """Request body for book or chapter summarization."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    chapter_ids: list[str] | None = None


class ExplainRequest(BaseModel):
    """Request body for passage explanation."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    text: str = Field(min_length=1)
    context: str | None = None


class AIFeedbackRequest(BaseModel):
    """Request body for AI response feedback."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    message_id: str | None = None
    rating: bool  # True=thumbs up, False=thumbs down
    comment: str | None = None


class ReadingPlanRequest(BaseModel):
    """Request body for generating a reading plan."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    total_days: int = Field(default=7, ge=1, le=90)
    daily_minutes: int = Field(default=30, ge=10, le=240)


class ReadingPlanResponse(BaseModel):
    """Response for reading plan."""

    success: bool = True
    data: dict


class CompanionModeRequest(BaseModel):
    """Request body for setting companion mode."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    mode: Literal['casual', 'scholar', 'socratic']
