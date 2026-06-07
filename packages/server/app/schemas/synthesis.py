"""Pydantic schemas for synthesis endpoints."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class SynthesisRequest(BaseModel):
    """Request body for running a synthesis analysis."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID
    include_highlights: bool = True
    include_notes: bool = True
    include_conversations: bool = True


class CompareRequest(BaseModel):
    """Request body for comparing two books."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id_1: UUID
    book_id_2: UUID


class SynthesisResponse(BaseModel):
    """Structured synthesis result."""

    success: bool = True
    data: dict  # {themes, connections, timeline, insights}
    error: str | None = None
