"""Pydantic schemas for memory book (Personal Reading Book) endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class MemoryBookGenerateRequest(BaseModel):
    """Request body for generating a memory book."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID | None = None
    format: Literal[
        'scrapbook',
        'journal',
        'timeline',
        'podcast',
        'personal_book',
        'reading_mirror',
    ] = 'reading_mirror'


class MemoryBookStats(BaseModel):
    """Stats embedded in a memory book response.

    Input keys come from the DB (snake_case JSONB); output keys are camelCase
    matching the frontend TypeScript interface.
    """

    total_highlights: int = Field(default=0, serialization_alias='totalHighlights')
    total_notes: int = Field(default=0, serialization_alias='totalNotes')
    total_conversations: int = Field(default=0, serialization_alias='totalConversations')
    total_sessions: int = Field(default=0, serialization_alias='totalSessions')
    total_reading_minutes: int = Field(default=0, serialization_alias='readingDuration')
    total_pages_read: int = Field(default=0, serialization_alias='pagesRead')
    concepts_discovered: int = Field(default=0, serialization_alias='conceptsDiscovered')
    connections_made: int = Field(default=0, serialization_alias='connectionsMade')

    model_config = ConfigDict(populate_by_name=True)


class MemoryBookResponse(BaseModel):
    """Serialized memory book returned to the client."""

    id: UUID
    book_id: UUID
    title: str
    format: str
    sections: list[dict]
    stats: MemoryBookStats = MemoryBookStats()
    html_content: str | None
    version: int = 1
    generated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )
