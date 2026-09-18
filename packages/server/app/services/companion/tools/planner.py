"""Tool-phase planner — the one LLM call that decides tool usage.

Failures are indistinguishable from "no tools needed": ``plan_tool_calls``
always returns a (possibly empty) list, never raises. The companion
stream treats an empty plan as "skip the tool phase entirely".
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts.tool_plan import TOOL_PLAN_HUMAN, TOOL_PLAN_SYSTEM, ToolPlanResult
from app.services.rag._constants import logger as _  # noqa: F401 — keep package logger import habit
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input

logger = structlog.get_logger('read-pal.companion')

# Routing key for LLM_FEATURE_ROUTING. The planner is deadline-bound (runs
# BEFORE the first answer token), so it must not sit behind a 429-storming
# primary: the default routing pins it to the stable provider. Keep this
# constant decoupled from log_label copy so routing survives label edits.
PLANNER_FEATURE = 'companion_tool_plan'

# Cheap summary of what the answer prompt ALREADY has — the planner must
# not re-request what context prep injected (keeps tool use minimal).
_CONTEXT_SUMMARY_CAP = 400


async def plan_tool_calls(
    *,
    user_id: UUID,
    book_id: UUID,
    message: str,
    book_title: str,
    book_author: str,
    progress: int,
    status: str,
    has_rag: bool,
    has_annotations: bool,
) -> list[dict[str, Any]]:
    """Ask the planner which tools to run; [] on any failure.

    Runs through :func:`safe_llm_invoke` with the strict ToolPlanResult
    schema — provider fallback, circuit breaking, and the daily budget
    all apply; the fallback value is an empty plan (degrade to direct
    answer, today's behavior).
    """
    from app.services.llm import safe_llm_invoke

    safe_title = sanitize_book_field(book_title or 'Untitled', field='title')
    safe_author = sanitize_book_field(book_author or 'Unknown', field='author')
    safe_message = sanitize_user_input(message, max_length=1000, context='tool_plan_message')

    have = []
    if has_rag:
        have.append('relevant passages from the current chapter/book (RAG)')
    if has_annotations:
        have.append("the reader's recent highlights/notes")
    context_summary = '; '.join(have) or 'none beyond the book metadata above'

    t0 = time.monotonic()
    data = await safe_llm_invoke(
        [
            SystemMessage(content=TOOL_PLAN_SYSTEM.template),
            HumanMessage(content=TOOL_PLAN_HUMAN.template.format(
                title=safe_title,
                author=safe_author,
                progress=progress,
                status=status,
                context_summary=context_summary[:_CONTEXT_SUMMARY_CAP],
                message=safe_message,
            )),
        ],
        fallback=ToolPlanResult().model_dump(),
        log_label='Companion tool plan',
        feature=PLANNER_FEATURE,
        schema_class=ToolPlanResult,
        user_id=str(user_id),
        book_id=str(book_id),
        template=TOOL_PLAN_SYSTEM,
    )

    # Defense in depth: the schema validates shape, the protocol parser
    # validates names/args/caps (unknown tools, >2 calls, junk args).
    from app.services.companion.tools.protocol import parse_tool_plan
    import json as _json
    plan = parse_tool_plan(_json.dumps(data))

    latency_ms = int((time.monotonic() - t0) * 1000)
    logger.info(
        'companion.tool_plan_decided',
        tools=[c['name'] for c in plan],
        latency_ms=latency_ms,
        user_id=str(user_id),
        book_id=str(book_id),
    )
    return plan
