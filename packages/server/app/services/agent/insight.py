"""Daily dashboard insight (matrix J4) — one grounded sentence per day.

Replaces the frontend's static date-modulo pool: when the reader has
books, a small facts block (most-recent book title, progress fraction,
annotation totals — reused verbatim from ``stats.get_dashboard_stats``,
so no new query surface and the P6.1 cache contract already covers it)
goes through ``safe_llm_call`` for one warm, specific sentence. A Redis
day-key caps cost at ONE LLM call per user per day; every failure path
(no books, LLM fallback, Redis down) degrades to ``insight: null`` and
the frontend keeps its canned pool — the card never blocks the
dashboard.
"""

from __future__ import annotations

import datetime as dt
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis
from app.prompts import INSIGHT_HUMAN, INSIGHT_SYSTEM
from app.services.llm import safe_llm_call
from app.services.stats.dashboard import get_dashboard_stats
from app.utils.sanitizer import sanitize_book_field

logger = structlog.get_logger("read-pal.insight")

# Outlives the day boundary in any timezone by a comfortable margin.
_INSIGHT_TTL_SECONDS = 26 * 3600
_MAX_INSIGHT_CHARS = 240


def _day_cache_key(user_id: UUID) -> str:
    return f"insight:v1:{user_id}:{dt.date.today().isoformat()}"


def _signals_from_stats(stats: dict) -> str | None:
    """Build the grounded facts block; None when there is nothing to say.

    Pure function so tests can pin the signal phrasing without a DB.
    """
    recent = stats.get("recentBooks") or []
    if not recent:
        return None
    book = recent[0]
    title = sanitize_book_field(book.get("title"), field="title")
    progress = int(round(float(book.get("progress") or 0) * 100))
    by_status = stats.get("booksByStatus") or {}
    total_books = sum(v or 0 for v in by_status.values())
    annotations = (stats.get("stats") or {}).get("conceptsLearned")
    return (
        f"most recently read book: {title}; reading progress: {progress}%; "
        f"annotations saved so far: {annotations if annotations is not None else 0}; "
        f"books in library: {total_books}; "
        f"reader language: zh if the title contains CJK else en; "
        f"today: {dt.date.today().isoformat()}"
    )


async def get_daily_insight(db: AsyncSession, user_id: UUID) -> dict:
    """Return ``{"insight": <sentence or null>}`` for the dashboard card."""
    stats = await get_dashboard_stats(db, user_id)
    signals = _signals_from_stats(stats)
    if signals is None:
        logger.info("insight.no_book", user_id=str(user_id))
        return {"insight": None}

    key = _day_cache_key(user_id)
    try:
        cached = await get_redis().get(key)
    except Exception:  # noqa: BLE001 — Redis down must not break the card
        cached = None
    if cached:
        text = cached.decode() if isinstance(cached, bytes) else str(cached)
        return {"insight": text}

    text = await safe_llm_call(
        [
            SystemMessage(content=INSIGHT_SYSTEM.template),
            HumanMessage(content=INSIGHT_HUMAN.template.format(signals=signals)),
        ],
        fallback="",
        log_label="Daily insight",
        user_id=str(user_id),
        book_id=None,
        template=INSIGHT_SYSTEM,
    )
    text = (text or "").strip()[:_MAX_INSIGHT_CHARS]
    if not text:
        logger.info("insight.llm_degraded", user_id=str(user_id))
        return {"insight": None}

    try:
        await get_redis().setex(key, _INSIGHT_TTL_SECONDS, text)
    except Exception:  # noqa: BLE001 — cache write is best-effort
        logger.debug("insight.cache_set_failed", user_id=str(user_id))
    return {"insight": text}
