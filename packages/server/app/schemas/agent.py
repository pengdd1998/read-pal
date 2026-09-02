"""Pydantic schemas for agent and friend endpoints."""

from typing import Any, Literal
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
    genre: Literal[
        'fiction', 'nonfiction', 'technical', 'academic',
        'poetry', 'biography', 'history', 'philosophy',
        'default'
    ] | None = None


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


class ResearchRequest(BaseModel):
    """Request body for the Phase 2 Research agent."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    question: str = Field(min_length=1, max_length=2000)
    # Narrows the search scope to the caller's own books with these ids;
    # foreign ids are dropped server-side, never widening the scope.
    book_ids: list[UUID] | None = Field(default=None, max_length=50)


class CancelStreamRequest(BaseModel):
    """Request body for cancelling an in-flight companion stream."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    request_id: str = Field(min_length=4, max_length=64)


class RegenerateRequest(BaseModel):
    """Request body for regenerating the last assistant response."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    persona: str | None = None
    genre: Literal[
        'fiction', 'nonfiction', 'technical', 'academic',
        'poetry', 'biography', 'history', 'philosophy',
        'default'
    ] | None = None
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



class DiscussionQuestionItem(BaseModel):
    """One annotation to seed discussion-question generation."""

    model_config = ConfigDict(populate_by_name=True)

    content: str = Field(min_length=1, max_length=4000)


class DiscussionQuestionsRequest(BaseModel):
    """Request body for POST /agents/discussion-questions.

    Matches the frontend contract (ShareDiscussionTab): the caller sends
    bookTitle/author/annotations in camelCase — NOT a chat message.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_title: str = Field(min_length=1, max_length=300)
    author: str | None = Field(None, max_length=200)
    annotations: list[DiscussionQuestionItem] = Field(default_factory=list, max_length=15)


class DiscussionQuestionsResponse(BaseModel):
    """Response: generated discussion questions."""

    success: bool = True
    data: dict[str, Any] = Field(default_factory=lambda: {'questions': []})
