"""Pydantic schemas for memory book (Personal Reading Book) endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MemoryBookGenerateRequest(BaseModel):
    """Request body for generating a memory book."""

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

    model_config = ConfigDict(from_attributes=True)
