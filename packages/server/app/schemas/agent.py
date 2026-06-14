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
    persona: str | None = None
    genre: Literal['fiction', 'nonfiction', 'technical', 'academic', 'default'] | None = None


class ChatData(BaseModel):
    """Inner data for chat responses."""

    role: str
    content: str


class ChatResponse(BaseModel):
    """Standard response for chat endpoints."""

    success: bool = True
    data: ChatData


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
    text: str = Field(min_length=1, max_length=10000)
    context: str | None = Field(None, max_length=5000)


class AIFeedbackRequest(BaseModel):
    """Request body for AI response feedback."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    message_id: str | None = None
    rating: bool  # True=thumbs up, False=thumbs down
    comment: str | None = Field(None, max_length=1000)


class ReadingPlanRequest(BaseModel):
    """Request body for generating a reading plan."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    total_days: int = Field(default=7, ge=1, le=90)
    daily_minutes: int = Field(default=30, ge=10, le=240)


class ReadingPlanData(BaseModel):
    """Inner data for reading plan responses."""

    id: str | None = None
    book_id: str | None = Field(None, validation_alias='bookId', serialization_alias='bookId')
    plan_text: str | None = Field(None, validation_alias='planText', serialization_alias='planText')
    total_days: int | None = Field(None, validation_alias='totalDays', serialization_alias='totalDays')
    current_day: int | None = Field(None, validation_alias='currentDay', serialization_alias='currentDay')
    is_active: bool | None = Field(None, validation_alias='isActive', serialization_alias='isActive')

    model_config = ConfigDict(populate_by_name=True)


class ReadingPlanResponse(BaseModel):
    """Response for reading plan."""

    success: bool = True
    data: ReadingPlanData


class CompanionModeRequest(BaseModel):
    """Request body for setting companion mode."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    mode: Literal['casual', 'scholar', 'socratic']


class MoodSceneRequest(BaseModel):
    """Request body for mood-based scene."""

    mood: str = Field(default='neutral', max_length=50)
    text: str = Field(default='', max_length=50000)


class AdvancePlanRequest(BaseModel):
    """Request body for advancing a reading plan."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID


class CancelStreamRequest(BaseModel):
    """Request body for cancelling an in-flight companion stream."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    request_id: str = Field(min_length=4, max_length=64)


class RegenerateRequest(BaseModel):
    """Request body for regenerating the last assistant response."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    persona: str | None = None
    genre: Literal['fiction', 'nonfiction', 'technical', 'academic', 'default'] | None = None
    context: dict | None = None


class ChatHistoryPage(BaseModel):
    """Paginated chat history response."""

    success: bool = True
    data: list['ChatHistoryItem'] = []
    next_cursor: str | None = None


class ChatHistoryItem(BaseModel):
    """Single chat history entry."""

    id: str
    book_id: str = Field(serialization_alias='bookId')
    role: str
    content: str
    created_at: str = Field(serialization_alias='createdAt')

    model_config = ConfigDict(populate_by_name=True)


ChatHistoryPage.model_rebuild()

