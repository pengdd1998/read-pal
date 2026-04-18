"""Pydantic v2 schemas for flashcard endpoints."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FlashcardCreate(BaseModel):
    book_id: UUID
    annotation_id: UUID | None = None
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class FlashcardReview(BaseModel):
    rating: int = Field(ge=0, le=5)


class FlashcardResponse(BaseModel):
    id: UUID
    user_id: UUID
    book_id: UUID
    annotation_id: UUID | None
    question: str
    answer: str
    ease_factor: float
    interval: int
    repetition_count: int
    next_review_at: datetime
    last_review_at: datetime | None
    last_rating: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {'from_attributes': True}
