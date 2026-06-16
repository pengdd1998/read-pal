"""Pydantic schemas for synthesis endpoints."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class SynthesisRequest(BaseModel):
    """Request body for running a synthesis analysis.

    ``book_id`` is optional here because the route takes it from the URL path;
    the body only carries the include_* flags plus an optional ``query`` that
    focuses the analysis on a reader question.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID | None = None
    include_highlights: bool = True
    include_notes: bool = True
    include_conversations: bool = True
    # Optional reader question — when provided, the synthesis prompt is focused
    # on answering it (instead of a generic whole-book analysis).
    query: str | None = None


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
