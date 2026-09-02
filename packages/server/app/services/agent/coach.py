"""Phase 2 Coach agent — comprehension monitoring for one book.

Pipeline: ownership-gated book load → reading signals (session
aggregates) + excerpts from the chapters most recently reached →
grounded assessment via ``safe_llm_invoke``.

Distinct from study_mode (chapter-content objectives/checks) and
interventions (rule-based behavior patterns): the Coach reads BOTH the
behavioral signals and the freshly-read content to say where
understanding may be thin and to hand back one-minute probes.
"""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book, BookStatus
from app.models.book_chunk import BookChunk
from app.models.reading_session import ReadingSession
from app.prompts import COACH_ASSESSMENT_HUMAN, COACH_ASSESSMENT_SYSTEM
from app.schemas.llm_outputs import CoachReport
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger("read-pal.coach")

# Same convention as research.py — never a bare TokenBudget().
_COACH_MODEL = "glm-4.7-flash"
_MAX_RECENT_CHUNKS = 6
_PER_EXCERPT_CHAR_CAP = 1200
_EXCERPTS_CHAR_CAP = 6000


async def _load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book | None:
    """Ownership-gated book load — foreign/missing ids return None."""
    result = await db.execute(select(Book).where(Book.id == book_id, Book.user_id == user_id))
    return result.scalar_one_or_none()


async def _collect_signals(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Aggregate this book's reading sessions into coach-visible signals."""
    row = (
        await db.execute(
            select(
                func.count(ReadingSession.id),
                func.coalesce(func.sum(ReadingSession.duration), 0),
                func.coalesce(func.sum(ReadingSession.pages_read), 0),
                func.max(ReadingSession.started_at),
            ).where(
                ReadingSession.user_id == user_id,
                ReadingSession.book_id == book_id,
            )
        )
    ).one()
    session_count, total_seconds, total_pages, last_read = row
    minutes = round(int(total_seconds) / 60)
    return {
        "session_count": int(session_count),
        "total_minutes": minutes,
        "total_pages_read": int(total_pages),
        "last_read_at": last_read.isoformat() if last_read else None,
        "avg_minutes_per_session": (round(minutes / session_count) if session_count else 0),
    }


def _spoiler_limit(book: Book) -> int | None:
    """P3.5: compare against the enum member — string compares never fire."""
    if book.status == BookStatus.completed:
        return None
    return book.current_segment


async def _recent_excerpts(db: AsyncSession, book: Book) -> list[dict[str, Any]]:
    """Latest chunks the reader has reached, newest chapter first.

    Scope mirrors the search path: book_id OR shared content_hash, and
    never past the spoiler limit. The hash clause is only added when the
    book carries one — ``content_hash IS NULL`` would match every legacy
    chunk in the table.
    """
    scope = [BookChunk.book_id == book.id]
    if book.content_hash:
        scope.append(BookChunk.content_hash == book.content_hash)
    conditions = [or_(*scope)]
    limit = _spoiler_limit(book)
    if limit is not None:
        conditions.append(BookChunk.chapter_index <= limit)

    result = await db.execute(
        select(BookChunk)
        .where(*conditions)
        .order_by(BookChunk.chapter_index.desc(), BookChunk.chunk_index.desc())
        .limit(_MAX_RECENT_CHUNKS),
    )
    chunks = list(result.scalars().all())
    if not chunks:
        return []

    from app.services.rag._helpers import _get_chapters

    chapters = await _get_chapters(db, book.id)

    excerpts: list[dict[str, Any]] = []
    for chunk in chunks:
        if not chunk.content:
            continue
        title = "Untitled"
        if 0 <= chunk.chapter_index < len(chapters):
            title = str(chapters[chunk.chapter_index].get("title") or "Untitled")
        excerpts.append(
            {
                "chapter_title": title,
                "chapter_index": chunk.chapter_index,
                "content": sanitize_user_input(
                    chunk.content[:_PER_EXCERPT_CHAR_CAP],
                    max_length=_PER_EXCERPT_CHAR_CAP,
                    context="coach_excerpt",
                ),
            }
        )
    return excerpts


def _format_signals(signals: dict[str, Any]) -> str:
    lines = [
        f"sessions: {signals['session_count']}",
        f"total minutes: {signals['total_minutes']}",
        f"pages read: {signals['total_pages_read']}",
        f"avg minutes/session: {signals['avg_minutes_per_session']}",
        f"last read: {signals['last_read_at'] or 'never'}",
    ]
    return "\n".join(lines)


def _format_excerpts(excerpts: list[dict[str, Any]]) -> str:
    parts = []
    for idx, ex in enumerate(reversed(excerpts), start=1):
        # reversed(): oldest→newest so numbering reads in reading order.
        parts.append(f"[{idx}] Chapter: {ex['chapter_title']}\n{ex['content']}")
    return "\n\n".join(parts)[:_EXCERPTS_CHAR_CAP]


def _progress_line(book: Book) -> str:
    pct = float(book.progress or 0)
    if book.status == BookStatus.completed:
        return f"completed ({pct:.0f}%)"
    return f"{pct:.0f}% — at chapter index {book.current_segment}"


def _is_coach_fallback(data: dict[str, Any]) -> bool:
    return (
        not data.get("session_summary") and not data.get("focus_areas") and not data.get("probes")
    )


async def run_coach_report(
    db: AsyncSession,
    user_id: UUID,
    book_id: UUID,
) -> dict[str, Any]:
    """Assess comprehension for one book; raises ValueError when not owned."""
    t0 = time.monotonic()
    book = await _load_book(db, user_id, book_id)
    if not book:
        raise ValueError("book not found")

    signals = await _collect_signals(db, user_id, book_id)
    excerpts = await _recent_excerpts(db, book)

    budget = TokenBudget(model=_COACH_MODEL)
    recent_block = budget.add(_format_excerpts(excerpts), "coach_recent_content")
    if budget.truncations:
        logger.warning(
            "coach_excerpts_truncated",
            truncations=", ".join(budget.truncations),
        )

    messages = [
        SystemMessage(content=COACH_ASSESSMENT_SYSTEM.template),
        HumanMessage(
            content=COACH_ASSESSMENT_HUMAN.template.format(
                title=sanitize_book_field(book.title, field="title"),
                author=sanitize_book_field(book.author, field="author") or "Unknown",
                progress=_progress_line(book),
                signals=_format_signals(signals),
                recent_content=recent_block or "(no excerpts available yet)",
            )
        ),
    ]
    data = await safe_llm_invoke(
        messages,
        fallback=CoachReport().model_dump(),
        log_label="Coach agent",
        schema_class=CoachReport,
        user_id=str(user_id),
        book_id=str(book_id),
        template=COACH_ASSESSMENT_SYSTEM,
    )

    is_fallback = _is_coach_fallback(data)
    if is_fallback:
        data["error"] = "AI analysis unavailable - showing partial results"

    elapsed = (time.monotonic() - t0) * 1000
    logger.info(
        "coach.completed",
        user_id=str(user_id),
        book_id=str(book_id),
        focus_areas_count=len(data.get("focus_areas", [])),
        probes_count=len(data.get("probes", [])),
        latency_ms=round(elapsed, 1),
    )
    return {
        "success": not is_fallback,
        # Signals ride along so the UI can render the factual half of the
        # report instantly, independent of LLM availability.
        "data": {**data, "signals": signals},
        "error": data.get("error") if is_fallback else None,
    }
