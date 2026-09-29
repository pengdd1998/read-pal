"""H5b (P-H): synthetic session threads over http_request_id chains.

read-pal has no session entity; the CCR "session list" equivalent here is
a query-layer grouping: chains (one http_request_id = one SSE turn) are
threaded by ``(user_id, book_id, 30-min activity gap)``. Zero schema
change — SQL aggregates per chain, Python threads the chains (same
pattern as metrics.py series bucketing). Users surface as 8-hex digests
(trace_queries convention); the 30-min threshold is fixed, parametrized
later if a real need appears.
"""

from __future__ import annotations

from datetime import datetime, timedelta, UTC
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_trace import LLMCallTrace

MAX_SESSION_WINDOW_HOURS = 168
THREAD_GAP = timedelta(minutes=30)
MAX_THREADS = 100


def _is_tool_label(label: str | None) -> bool:
    return bool(label) and 'tool' in label.lower()


async def list_synthetic_sessions(db: AsyncSession, hours: int) -> dict[str, Any]:
    """Chain aggregates threaded into sessions, newest first."""
    hours = max(1, min(hours, MAX_SESSION_WINDOW_HOURS))
    since = datetime.now(UTC) - timedelta(hours=hours)

    rows = (await db.execute(
        select(
            LLMCallTrace.http_request_id,
            LLMCallTrace.user_id,
            LLMCallTrace.book_id,
            func.min(LLMCallTrace.created_at).label('start'),
            func.max(LLMCallTrace.created_at).label('last'),
            func.count(LLMCallTrace.id).label('calls'),
            func.coalesce(func.sum(LLMCallTrace.total_tokens), 0).label('tokens'),
            func.coalesce(func.sum(LLMCallTrace.estimated_cost_usd), 0.0).label('cost'),
            func.count(LLMCallTrace.id).filter(LLMCallTrace.success.is_(False)).label('errors'),
            func.count(LLMCallTrace.id).filter(LLMCallTrace.fallback_used.is_(True)).label('fallbacks'),
            func.count(LLMCallTrace.id).filter(LLMCallTrace.cache_hit.is_(True)).label('cache_hits'),
        ).where(
            LLMCallTrace.created_at >= since,
            LLMCallTrace.http_request_id.isnot(None),
        ).group_by(
            LLMCallTrace.http_request_id,
            LLMCallTrace.user_id,
            LLMCallTrace.book_id,
        ).order_by(func.min(LLMCallTrace.created_at).asc()),
    )).all()

    # labels/models/providers per chain — one pass over the window rows
    detail = (await db.execute(
        select(
            LLMCallTrace.http_request_id,
            LLMCallTrace.label,
            LLMCallTrace.model,
            LLMCallTrace.provider,
        ).where(
            LLMCallTrace.created_at >= since,
            LLMCallTrace.http_request_id.isnot(None),
        ),
    )).all()
    meta: dict[str, dict[str, set[str]]] = {}
    for http_id, label, model, provider in detail:
        m = meta.setdefault(http_id, {'labels': set(), 'models': set(), 'providers': set()})
        if label:
            m['labels'].add(label)
        if model:
            m['models'].add(model)
        if provider:
            m['providers'].add(provider)

    import hashlib

    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for r in rows:
        user_digest = hashlib.sha256(str(r.user_id).encode()).hexdigest()[:8] if r.user_id else None
        chain = {
            'http_request_id': r.http_request_id,
            'start': r.start.isoformat(),
            'calls': r.calls,
        }
        starts_new = (
            current is None
            or r.user_id != current['_user']
            or r.book_id != current['_book']
            or (r.start - current['_last']) > THREAD_GAP
        )
        if starts_new:
            current = {
                '_user': r.user_id,
                '_book': r.book_id,
                '_last': r.last,
                'user': user_digest,
                'book_id': r.book_id,
                'started_at': r.start.isoformat(),
                'last_active_at': r.last.isoformat(),
                'chains': 0,
                'calls': 0,
                'tool_calls': 0,
                'errors': 0,
                'fallbacks': 0,
                'cache_hits': 0,
                'tokens': 0,
                'cost_usd': 0.0,
                'models': set(),
                'providers': set(),
                'chain_list': [],
            }
            sessions.append(current)
        current['_last'] = max(current['_last'], r.last)
        current['chains'] += 1
        current['calls'] += r.calls
        current['errors'] += r.errors or 0
        current['fallbacks'] += r.fallbacks or 0
        current['cache_hits'] += r.cache_hits or 0
        current['tokens'] += r.tokens or 0
        current['cost_usd'] += float(r.cost or 0.0)
        current['chain_list'].append(chain)
        m = meta.get(r.http_request_id, {})
        current['models'].update(m.get('models', set()))
        current['providers'].update(m.get('providers', set()))
        current['tool_calls'] += sum(1 for lb in m.get('labels', set()) if _is_tool_label(lb))

    sessions.sort(key=lambda s: s['started_at'], reverse=True)
    for s in sessions:
        s['models'] = sorted(s['models'])
        s['providers'] = sorted(s['providers'])
        s['cache_ratio'] = (s['cache_hits'] / s['calls']) if s['calls'] else 0.0
    return {
        'sessions': [
            {k: v for k, v in s.items() if not k.startswith('_')} for s in sessions[:MAX_THREADS]
        ],
        'total': len(sessions),
        'window_hours': hours,
    }
