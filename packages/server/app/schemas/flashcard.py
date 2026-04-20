"""Pydantic v2 schemas for flashcard endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class FlashcardCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    annotation_id: UUID | None = None
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FlashcardReview(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    rating: int = Field(ge=0, le=5)


class FlashcardResponse(BaseModel):
    """Flashcard response with camelCase aliases for frontend compatibility."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )

    id: UUID
    user_id: UUID
    book_id: UUID
    annotation_id: UUID | None
    question: str
    answer: str
    ease_factor: float
    interval: int
    repetition_count: int
    next_review_at: datetime | None
    last_review_at: datetime | None
    last_rating: int | None
    created_at: datetime | None
    updated_at: datetime | None
