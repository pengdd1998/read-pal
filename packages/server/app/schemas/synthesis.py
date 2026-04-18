"""Pydantic schemas for synthesis endpoints."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class SynthesisRequest(BaseModel):
    """Request body for running a synthesis analysis."""

    book_id: UUID
    include_highlights: bool = True
    include_notes: bool = True
    include_conversations: bool = True


class SynthesisResponse(BaseModel):
    """Structured synthesis result."""

    success: bool = True
    data: dict  # {themes, connections, timeline, insights}
