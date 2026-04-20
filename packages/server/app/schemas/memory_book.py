"""Pydantic schemas for memory book (Personal Reading Book) endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class MemoryBookGenerateRequest(BaseModel):
    """Request body for generating a memory book."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    format: Literal[
        'scrapbook',
        'journal',
        'timeline',
        'podcast',
        'personal_book',
    ] = 'personal_book'


class MemoryBookResponse(BaseModel):
    """Serialized memory book returned to the client."""

    id: UUID
    book_id: UUID
    title: str
    format: str
    sections: list[dict]
    stats: dict
    html_content: str | None
    generated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=to_camel,
    )
