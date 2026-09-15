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
# Planner wall-clock deadline: healthy plan calls land in 2-5s; the 9s
# default caps pre-first-token dead air (see run_tool_phase). Configurable
# via COMPANION_TOOL_PLAN_TIMEOUT_MS for slow environments (WT round
# 2026-09-15: planner at 23.4s was silently degraded — tools unreachable).
PLAN_DEADLINE_S = 9.0


def _plan_deadline_s() -> float:
    from app.config import get_settings
    return get_settings().companion_tool_plan_timeout_ms / 1000.0


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
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    """Return ``(amended system_text, tool_results, proposals)``.

    ``tool_results`` is empty when the phase is disabled, classified out,
    planned empty, or failed anywhere — in all those cases system_text is
    returned unchanged and the caller skips the status frame.
    """
    from app.config import get_settings

    if not get_settings().companion_tools_enabled:
        return system_text, [], []

    # Fast-path gate: only book-content questions pay the planning hop;
    # skip/general turns keep today's zero-added-latency behavior.
    if classify_query(message, history_texts) != 'content':
        return system_text, [], []

    from app.services.companion.tools.planner import plan_tool_calls

    # Hard deadline (plan §3, restored 2026-09-14): the planner runs
    # BEFORE any first token, so its whole latency is dead air. Under a
    # 429-throttled glm the safe_invoke retry ladder (3 attempts × [5,15]s
    # backoff + 15s per-attempt timeout ≈ 70s) used to burn here before
    # the mimo fallback even started — the TL test round caught first
    # questions hanging exactly this way. Past the deadline: skip tools,
    # answer directly (tools are an enhancement, never a prerequisite).
    import asyncio as _asyncio

    t0 = time.monotonic()
    deadline_s = _plan_deadline_s()
    try:
        plan = await _asyncio.wait_for(
            plan_tool_calls(
                user_id=user_id, book_id=book_id, message=message,
                book_title=book.title, book_author=book.author,
                progress=book.progress,
                status=book.status.value if hasattr(book.status, 'value') else str(book.status),
                has_rag=True,  # content-classified turns always ran RAG
                has_annotations=any(t for t in history_texts),
            ),
            timeout=deadline_s,
        )
    except TimeoutError:
        logger.warning(
            'companion.tool_phase_skipped reason=planner_deadline '
            'deadline_s=%s user=%s book=%s',
            deadline_s, str(user_id), str(book_id),
        )
        return system_text, [], []
    if not plan:
        return system_text, [], []

    from app.services.companion.tools.registry import (
        TOOL_SPECS, execute_tool, render_tool_results,
    )

    # v2 routing: reads execute and inject; proposals validate + frame.
    proposals: list[dict[str, Any]] = []
    hint_parts: list[str] = []
    from app.config import get_settings as _gs
    proposals_enabled = _gs().companion_tool_proposals_enabled

    results: list[dict[str, Any]] = []
    for call in plan:
        spec = TOOL_SPECS[call['name']]
        if spec.kind == 'proposal':
            if not proposals_enabled:
                continue
            try:
                parsed = spec.args_model.model_validate(call['args'])
            except Exception:  # noqa: BLE001 — bad proposal args degrade silently
                logger.info(
                    'companion.tool_proposal_args_invalid tool=%s', call['name'],
                )
                continue
            proposals.append({
                'id': f'{call["name"]}-{int(t0 * 1000) % 100000}',
                'tool': call['name'],
                'args': parsed.model_dump(),
                'preview': parsed.model_dump().get('preview', ''),
            })
            hint_parts.append(
                f'A {call["name"]} proposal card has been shown to the '
                'reader — they will confirm or dismiss it. Reference it '
                'naturally ("我把它放在卡片里了，确认就能保存"), never claim '
                'it is already saved.'
            )
            continue
        results.append(await execute_tool(
            db, call['name'], call['args'], user_id=user_id, book_id=book_id,
        ))

    rendered = render_tool_results(results)
    if rendered:
        # Own budget slot: bounded, truncatable, never crowds out
        # reserved history/user-message slots.
        system_text = system_text + '\n\n' + (
            budget.add(rendered, 'tool_results') or ''
        )
    if hint_parts:
        system_text += '\n\n[v2_proposal_notice]\n' + '\n'.join(hint_parts) + '\n[/v2_proposal_notice]'

    logger.info(
        'companion.tool_phase_completed',
        tools=[r['tool'] for r in results],
        ok_count=sum(1 for r in results if r.get('ok')),
        proposals=[p['tool'] for p in proposals],
        latency_ms=int((time.monotonic() - t0) * 1000),
        user_id=str(user_id), book_id=str(book_id),
    )
    return system_text, results, proposals
