"""Row-level LLM trace queries (monitoring-upgrade P-A).

The five minimal indicators answer "is it healthy"; these answer "which
exact request broke". Two levels, mirroring the CCR workbench drill-down:

- ``list_llm_traces`` — filterable, paginated, newest-first rows over
  ``llm_call_traces``.
- ``get_trace_chain`` — every trace sharing one ``http_request_id``: a
  single SSE turn's full call chain (main answer + tool loop + provider
  fallback retries), oldest-first, plus a chain-level summary.

Privacy: ``user_id`` never leaves as a raw UUID — it is shortened to an
8-hex salted-free digest, enough to correlate rows without exposing ids.
Trace rows contain no prompt/completion content by design (the observability
writer stores metadata only); these queries likewise return metadata only.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_trace import LLMCallTrace

MAX_TRACE_PAGE = 100
DEFAULT_TRACE_PAGE = 50
MAX_TRACE_WINDOW_HOURS = 168  # 7 days — row-level drilling needs recency


def short_uid(user_id: str | None) -> str | None:
    """Stable 8-hex digest of a user id for cross-row correlation."""
    if not user_id:
        return None
    return hashlib.sha256(user_id.encode()).hexdigest()[:8]


def _span_dict(t: LLMCallTrace) -> dict[str, Any]:
    """One trace row as an ops-facing span (metadata only, hashed user)."""
    return {
        'id': str(t.id),
        'request_id': t.request_id,
        'http_request_id': t.http_request_id,
        'ts': t.created_at.isoformat(timespec='milliseconds') if t.created_at else None,
        'label': t.label,
        'model': t.model,
        'provider': t.provider,
        'latency_ms': t.latency_ms,
        'ttft_ms': t.ttft_ms,
        'success': t.success,
        'error_type': t.error_type,
        'error_message': (t.error_message or '')[:200] or None,
        'fallback_used': bool(t.fallback_used),
        'cache_hit': bool(t.cache_hit),
        'finish_reason': t.finish_reason,
        'prompt_version': t.prompt_version,
        'lang': t.lang,
        'tokens': {
            'input': t.prompt_tokens,
            'output': t.completion_tokens,
            'total': t.total_tokens,
        },
        'estimated_cost_usd': t.estimated_cost_usd,
        'user': short_uid(t.user_id),
        'book_id': t.book_id,
    }


async def list_llm_traces(
    session: AsyncSession,
    *,
    hours: int = 24,
    label: str | None = None,
    success: bool | None = None,
    error_type: str | None = None,
    request_prefix: str | None = None,
    limit: int = DEFAULT_TRACE_PAGE,
    offset: int = 0,
) -> dict[str, Any]:
    """Filterable newest-first trace rows + total for pagination."""
    hours = max(1, min(hours, MAX_TRACE_WINDOW_HOURS))
    limit = max(1, min(limit, MAX_TRACE_PAGE))
    offset = max(0, offset)
    since = datetime.now(UTC) - timedelta(hours=hours)

    conditions = [LLMCallTrace.created_at >= since]
    if label:
        conditions.append(LLMCallTrace.label == label)
    if success is not None:
        conditions.append(LLMCallTrace.success == success)
    if error_type:
        conditions.append(LLMCallTrace.error_type == error_type)
    if request_prefix:
        conditions.append(LLMCallTrace.http_request_id.startswith(request_prefix))

    total = (
        await session.execute(
            select(func.count()).select_from(LLMCallTrace).where(*conditions)
        )
    ).scalar() or 0

    rows = (
        await session.execute(
            select(LLMCallTrace)
            .where(*conditions)
            .order_by(LLMCallTrace.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).scalars().all()

    return {
        'total': total,
        'limit': limit,
        'offset': offset,
        'items': [_span_dict(t) for t in rows],
    }


async def get_trace_chain(
    session: AsyncSession,
    http_request_id: str,
) -> dict[str, Any] | None:
    """All traces sharing one ``http_request_id`` (one SSE turn's chain).

    Returns ``None`` when the id matches nothing — the router maps that
    to 404. Chain latency spans from the oldest row's start to the newest
    row's finish (created_at + latency_ms), so overlapping spans (tool
    loop + main answer run concurrently) don't double-count.
    """
    rows = (
        await session.execute(
            select(LLMCallTrace)
            .where(LLMCallTrace.http_request_id == http_request_id)
            .order_by(LLMCallTrace.created_at.asc())
        )
    ).scalars().all()
    if not rows:
        return None

    finishes = [
        t.created_at + timedelta(milliseconds=t.latency_ms or 0) for t in rows
    ]
    chain_latency_ms = int(
        (max(finishes) - min(t.created_at for t in rows)).total_seconds() * 1000
    )
    return {
        'http_request_id': http_request_id,
        'span_count': len(rows),
        'chain_latency_ms': chain_latency_ms,
        'labels': sorted({t.label for t in rows}),
        'providers': sorted({t.provider for t in rows if t.provider}),
        'has_fallback': any(t.fallback_used for t in rows),
        'all_success': all(t.success for t in rows),
        'spans': [_span_dict(t) for t in rows],
    }
