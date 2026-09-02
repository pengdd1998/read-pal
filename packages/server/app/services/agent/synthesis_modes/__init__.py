"""Phase 2 Synthesis agent — mode-aware dispatch for the synthesis panel.

The panel's five tabs used to POST mode-specific fields that
``SynthesisRequest`` silently ignored (extra=ignore), so every tab ran
the same generic analysis. This package gives four of the five modes
real backends; ``synthesize`` stays on the pre-existing single-book
path.

Content-grounded modes (cross_reference / concept_map / contradictions)
live in ``content_modes`` and reuse the Research agent's ownership-gated
cross-book retrieval; the summary-report mode lives in ``report_mode``
and reuses the cross-book reading-data collector.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.synthesis import SynthesisRequest
from app.services.agent.synthesis_modes.content_modes import (
    run_concept_map,
    run_contradictions,
    run_cross_reference,
)
from app.services.agent.synthesis_modes.report_mode import run_summary_report

__all__ = [
    "resolve_synthesis_mode",
    "run_concept_map",
    "run_contradictions",
    "run_cross_reference",
    "run_summary_report",
    "run_synthesis_mode",
]

# Canonical mode names and their UI aliases (SingleBookAnalysisCard sends
# 'contradictions'/'summary'; SynthesisPanel sends 'find_contradictions'/
# 'summary_report'). 'synthesize' maps to None → legacy single-book path.
_MODE_ALIASES: dict[str, str | None] = {
    "cross_reference": "cross_reference",
    "concept_map": "concept_map",
    "find_contradictions": "contradictions",
    "contradictions": "contradictions",
    "summary_report": "summary_report",
    "summary": "summary_report",
    "synthesize": None,
}


def resolve_synthesis_mode(body: SynthesisRequest | None) -> str | None:
    """Canonical mode for a request body, or None for the legacy path.

    Explicit ``mode`` wins; otherwise the mode-specific fields identify
    the tab (the panel didn't send ``mode`` before this upgrade). Field
    order matches the tabs' distinctive payloads.
    """
    if body is None:
        return None
    if body.mode:
        return _MODE_ALIASES.get(body.mode.strip().lower())
    if body.concept:
        return "cross_reference"
    if body.max_nodes is not None:
        return "concept_map"
    if body.min_severity is not None:
        return "contradictions"
    if body.format is not None or body.focus:
        return "summary_report"
    return None


async def run_synthesis_mode(
    db: AsyncSession,
    user_id: UUID,
    mode: str,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Dispatch one canonical mode. Unknown modes raise ValueError."""
    handlers = {
        "cross_reference": run_cross_reference,
        "concept_map": run_concept_map,
        "contradictions": run_contradictions,
        "summary_report": run_summary_report,
    }
    handler = handlers.get(mode)
    if handler is None:
        raise ValueError(f"unknown synthesis mode: {mode}")
    return await handler(db, user_id, body, book_id)
