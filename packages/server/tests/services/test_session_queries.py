"""H5b (P-H): synthetic session threading semantics.

Pins the grouping contract: chains thread by (user, book, 30-min gap);
a user change, book change, or >30-min gap starts a new session; NULL
http_request_id rows are ignored (they cannot chain).
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.llm_trace import LLMCallTrace
from app.services.llm.session_queries import list_synthetic_sessions
from tests.conftest import _TestSession


def _trace(*, http_id: str | None, minutes_ago: float, user: str = 'u1',
           book: str | None = 'bk1', label: str = 'companion.stream',
           tokens: int = 10, success: bool = True, fallback: bool = False) -> LLMCallTrace:
    return LLMCallTrace(
        request_id=uuid4().hex[:12],
        http_request_id=http_id,
        label=label,
        provider='glm',
        model='glm-4.7-flash',
        user_id=user,
        book_id=book,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
        latency_ms=100.0,
        success=success,
        fallback_used=fallback,
        prompt_tokens=tokens // 2,
        completion_tokens=tokens // 2,
        total_tokens=tokens,
        estimated_cost_usd=0.001,
        cache_hit=False,
    )


@pytest.mark.asyncio
async def test_threading_by_user_book_and_gap():
    async with _TestSession() as db:
        rows = [
            # session 1: u1+bk1, chains at 100m / 90m / 65m ago (gaps 10m,25m)
            _trace(http_id='s1-a', minutes_ago=100),
            _trace(http_id='s1-b', minutes_ago=90),
            _trace(http_id='s1-c', minutes_ago=65),
            # same user+book but 30m+ gap from 65m ago → new session
            _trace(http_id='s2-a', minutes_ago=20),
            # different user, same book, no gap issue → own session
            _trace(http_id='s3-a', minutes_ago=18, user='u2'),
            # u1 different book → own session
            _trace(http_id='s4-a', minutes_ago=15, book='bk2'),
            # NULL http_request_id → excluded entirely
            _trace(http_id=None, minutes_ago=10, label='test.session.null'),
            # tool label counted
            _trace(http_id='s2-a', minutes_ago=19, label='Companion tool plan'),
        ]
        db.add_all(rows)
        await db.commit()

        data = await list_synthetic_sessions(db, hours=24)
        sessions = data['sessions']

        assert data['total'] == 4
        by_ids = {tuple(sorted(c['http_request_id'] for c in s['chain_list'])): s for s in sessions}
        assert ('s1-a', 's1-b', 's1-c') in by_ids
        s1 = by_ids[('s1-a', 's1-b', 's1-c')]
        assert s1['chains'] == 3 and s1['calls'] == 3
        assert len(s1['user']) == 8  # digest

        s2 = by_ids[('s2-a',)]
        assert s2['calls'] == 2 and s2['tool_calls'] == 1  # tool label counted

        # newest first
        assert sessions[0]['chain_list'][0]['http_request_id'] in ('s2-a', 's4-a')

        ids = ['s1-a', 's1-b', 's1-c', 's2-a', 's3-a', 's4-a']
        for r in (await db.execute(
            select(LLMCallTrace).where(
                LLMCallTrace.http_request_id.in_(ids)
                | (LLMCallTrace.label == 'test.session.null'),
            ),
        )).scalars():
            await db.delete(r)
        await db.commit()


@pytest.mark.asyncio
async def test_window_clamp_and_empty():
    async with _TestSession() as db:
        data = await list_synthetic_sessions(db, hours=999)
        assert data['window_hours'] == 168  # clamped
        # empty window is a valid empty result, not an error
        data = await list_synthetic_sessions(db, hours=1)
        assert isinstance(data['sessions'], list)
