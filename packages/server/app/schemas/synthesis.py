"""Pydantic schemas for synthesis endpoints."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class SynthesisRequest(BaseModel):
    """Request body for running a synthesis analysis.

    ``book_id`` is optional here because the route takes it from the URL path;
    the body only carries the include_* flags plus an optional ``query`` that
    focuses the analysis on a reader question.

    Phase 2 multi-mode fields below carry the synthesis panel's five tabs.
    ``mode`` is the explicit discriminator (validated); when absent, the
    mode-specific fields identify the tab server-side — historically these
    fields were silently dropped (extra=ignore) and every tab ran the same
    generic analysis.
    """

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    book_id: UUID | None = None
    include_highlights: bool = True
    include_notes: bool = True
    include_conversations: bool = True
    # Optional reader question — when provided, the synthesis prompt is focused
    # on answering it (instead of a generic whole-book analysis).
    query: str | None = None

    mode: Literal[
        'cross_reference', 'concept_map', 'find_contradictions',
        'contradictions', 'summary_report', 'summary', 'synthesize',
    ] | None = None
    # cross_reference tab
    concept: str | None = Field(None, max_length=300)
    source_book_id: UUID | None = None  # path book_id is the source; accepted for contract fidelity
    analysis_type: Literal['supporting', 'contradicting', 'extending', 'all'] | None = None
    # concept_map tab
    topic: str | None = Field(None, max_length=300)
    max_nodes: int | None = Field(None, ge=5, le=50)
    # find_contradictions tab
    min_severity: Literal['low', 'medium', 'high'] | None = None
    # summary_report / synthesize tabs
    book_ids: list[UUID] | None = Field(None, max_length=20)
    focus: str | None = Field(None, max_length=300)
    format: Literal['narrative', 'structured', 'academic'] | None = None
    depth: Literal['brief', 'standard', 'deep'] | None = None


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
