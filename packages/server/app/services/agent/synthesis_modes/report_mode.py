"""Summary-report synthesis mode — cross-book reading-data report."""

from __future__ import annotations

import json
import time
from typing import Any
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.prompts import (
    SUMMARY_REPORT_HUMAN,
    SUMMARY_REPORT_SYSTEM,
)
from app.schemas.llm_outputs import SummaryReportResult
from app.schemas.synthesis import SynthesisRequest
from app.services.agent.synthesis_modes._shared import (
    _SYNTHESIS_MODEL,
    completed_log,
    invoke,
    mark_fallback,
    result,
)
from app.services.cross_book_synthesis import batch_collect_reading_data
from app.utils.sanitizer import sanitize_user_input
from app.utils.token_budget import TokenBudget

import structlog

logger = structlog.get_logger("read-pal.synthesis")


async def run_summary_report(
    db: AsyncSession,
    user_id: UUID,
    body: SynthesisRequest,
    book_id: UUID,
) -> dict[str, Any]:
    """Cross-book reading-data report (focus + format aware)."""
    t0 = time.monotonic()
    scoped_ids = body.book_ids or [book_id]
    data_map = await batch_collect_reading_data(db, user_id, scoped_ids, True, True, False)
    all_book_data = [data_map[bid] for bid in scoped_ids if bid in data_map]

    if not all_book_data:
        return {
            "success": False,
            "data": {"error": "No readable books"},
            "error": "No readable books",
        }

    focus = (body.focus or "").strip()
    focus_clause = (
        f' focused on "{sanitize_user_input(focus, max_length=300, context="sr_focus")}"'
        if focus
        else ""
    )

    budget = TokenBudget(model=_SYNTHESIS_MODEL)
    budgeted = budget.add(json.dumps(all_book_data, default=str), "sr_data")
    if budget.truncations:
        logger.warning(
            "summary_report_data_truncated",
            truncations=", ".join(budget.truncations),
        )

    data = await invoke(
        [
            SystemMessage(content=SUMMARY_REPORT_SYSTEM.template),
            HumanMessage(
                content=SUMMARY_REPORT_HUMAN.template.format(
                    report_format=body.format or "structured",
                    focus_clause=focus_clause,
                    data=budgeted,
                )
            ),
        ],
        SummaryReportResult,
        SUMMARY_REPORT_SYSTEM,
        "Synthesis summary report",
        user_id,
    )
    data, is_fallback = mark_fallback(data, "report")
    # booksCovered is camelCase in the frontend contract (raw cast, no
    # mapping) — set it explicitly rather than relying on model_dump.
    data["booksCovered"] = len(all_book_data)
    completed_log("summary_report", user_id, t0, books_covered=len(all_book_data))
    return result(data, is_fallback)
