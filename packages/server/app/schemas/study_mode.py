"""Pydantic schemas for study mode endpoints."""

from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

CHAPTER_CONTENT_MAX = 10_000


class StudyObjectivesRequest(BaseModel):
    """Request body for generating study objectives."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = Field(
        None, validation_alias=AliasChoices('book_id', 'bookId'),
    )
    chapter_title: str | None = Field(
        None, validation_alias=AliasChoices('chapter_title', 'chapterTitle'),
    )
    chapter_index: int | None = Field(
        None, validation_alias=AliasChoices('chapter_index', 'chapterIndex'),
    )
    chapter_content: str | None = Field(
        None, validation_alias=AliasChoices('chapter_content', 'chapterContent'),
        max_length=CHAPTER_CONTENT_MAX,
    )


class ConceptCheckRequest(BaseModel):
    """Request body for generating concept checks."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = Field(
        None, validation_alias=AliasChoices('book_id', 'bookId'),
    )
    chapter_title: str | None = Field(
        None, validation_alias=AliasChoices('chapter_title', 'chapterTitle'),
    )
    chapter_index: int | None = Field(
        None, validation_alias=AliasChoices('chapter_index', 'chapterIndex'),
    )
    chapter_content: str | None = Field(
        None, validation_alias=AliasChoices('chapter_content', 'chapterContent'),
        max_length=CHAPTER_CONTENT_MAX,
    )


class SaveChecksRequest(BaseModel):
    """Request body for saving concept check results as flashcards."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: str | None = Field(
        None, validation_alias=AliasChoices('book_id', 'bookId'),
    )
    checks: list[Any] = []
