"""Pydantic schemas for study mode endpoints."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class StudyObjectivesRequest(BaseModel):
    """Request body for generating study objectives."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = None
    bookId: str | None = None
    chapter_title: str | None = None
    chapterTitle: str | None = None
    chapter_index: int | None = None
    chapterIndex: int | None = None


class ConceptCheckRequest(BaseModel):
    """Request body for generating concept checks."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = None
    bookId: str | None = None
    chapter_title: str | None = None
    chapterTitle: str | None = None
    chapter_index: int | None = None
    chapterIndex: int | None = None
    chapter_content: str | None = None
    chapterContent: str | None = None


class SaveChecksRequest(BaseModel):
    """Request body for saving concept check results as flashcards."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = None
    bookId: str | None = None
    checks: list[Any] = []
