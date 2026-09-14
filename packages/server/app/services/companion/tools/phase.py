"""The tool phase — orchestration between context prep and the answer.

Extracted from ``streaming.stream_chat`` (services file-length cap):
plan → execute (≤2, server-injected identity) → render into the system
prompt under its own budget slot. Every failure degrades to a no-op:
the phase may only ever AMEND the turn, never break it.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.services.companion.query_classifier import classify_query
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger('read-pal.companion')

# Budget slot cap for rendered tool results (plan §3).
_TOOL_RESULTS_TOKENS = 1500


async def run_tool_phase(
    *,
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
    message: str,
    history_texts: list[str],
    book: Book,
    system_text: str,
    budget: TokenBudget,
) -> tuple[str, list[dict[str, Any]]]:
    """Return ``(amended system_text, tool_results)``.

    ``tool_results`` is empty when the phase is disabled, classified out,
    planned empty, or failed anywhere — in all those cases system_text is
    returned unchanged and the caller skips the status frame.
    """
    from app.config import get_settings

    if not get_settings().companion_tools_enabled:
        return system_text, []

    # Fast-path gate: only book-content questions pay the planning hop;
    # skip/general turns keep today's zero-added-latency behavior.
    if classify_query(message, history_texts) != 'content':
        return system_text, []

    from app.services.companion.tools.planner import plan_tool_calls

    t0 = time.monotonic()
    plan = await plan_tool_calls(
        user_id=user_id, book_id=book_id, message=message,
        book_title=book.title, book_author=book.author,
        progress=book.progress,
        status=book.status.value if hasattr(book.status, 'value') else str(book.status),
        has_rag=True,  # content-classified turns always ran RAG
        has_annotations=any(t for t in history_texts),
    )
    if not plan:
        return system_text, []

    from app.services.companion.tools.registry import execute_tool, render_tool_results

    results: list[dict[str, Any]] = []
    for call in plan:
        results.append(await execute_tool(
            db, call['name'], call['args'], user_id=user_id, book_id=book_id,
        ))

    rendered = render_tool_results(results)
    if rendered:
        # Own budget slot: bounded, truncatable, never crowds out
        # reserved history/user-message slots.
        amended = system_text + '\n\n' + (
            budget.add(rendered, 'tool_results') or ''
        )
    else:
        amended = system_text

    logger.info(
        'companion.tool_phase_completed',
        tools=[r['tool'] for r in results],
        ok_count=sum(1 for r in results if r.get('ok')),
        latency_ms=int((time.monotonic() - t0) * 1000),
        user_id=str(user_id), book_id=str(book_id),
    )
    return amended, results
