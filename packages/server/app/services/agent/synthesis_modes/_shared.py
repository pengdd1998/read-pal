"""Shared plumbing for the synthesis multi-mode backends."""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.book import Book
from app.services.llm import safe_llm_invoke
from app.utils.sanitizer import sanitize_book_field, sanitize_user_input
from app.utils.token_budget import TokenBudget

logger = structlog.get_logger("read-pal.synthesis")

# Phase 2 agents run on the default GLM family — same convention as
# research.py/coach.py. Never a bare TokenBudget().
_SYNTHESIS_MODEL = "glm-4.7-flash"
_SOURCES_CHAR_CAP = 10_000
_PER_SOURCE_CHAR_CAP = 1200

_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2}


async def load_book(db: AsyncSession, user_id: UUID, book_id: UUID) -> Book | None:
    result = await db.execute(select(Book).where(Book.id == book_id, Book.user_id == user_id))
    return result.scalar_one_or_none()


async def load_scoped_titles(
    db: AsyncSession,
    user_id: UUID,
    book_ids: list[UUID],
) -> list[Book]:
    result = await db.execute(select(Book).where(Book.user_id == user_id, Book.id.in_(book_ids)))
    return list(result.scalars().all())


def format_sources(chunks: list[dict]) -> str:
    """Number excerpts so model items can trace to source_id (Research idiom)."""
    lines: list[str] = []
    for idx, chunk in enumerate(chunks, start=1):
        title = sanitize_book_field(chunk.get("book_title"), field="title")
        author = sanitize_book_field(chunk.get("author"), field="author")
        chapter = (chunk.get("title") or "Untitled").strip()
        content = sanitize_user_input(
            chunk.get("content", ""),
            max_length=_PER_SOURCE_CHAR_CAP,
            context="synthesis_mode_source",
        )
        lines.append(f"[{idx}] {title} — {author or 'Unknown'} — Chapter: {chapter}\n{content}")
    return "\n\n".join(lines)[:_SOURCES_CHAR_CAP]


def budgeted_sources(chunks: list[dict], label: str) -> str:
    budget = TokenBudget(model=_SYNTHESIS_MODEL)
    sources = budget.add(format_sources(chunks), label)
    if budget.truncations:
        logger.warning(
            "synthesis_mode_sources_truncated",
            truncations=", ".join(budget.truncations),
        )
    return sources


def mark_fallback(data: dict[str, Any], primary_key: str) -> tuple[dict[str, Any], bool]:
    """Shared fallback convention: primary field empty → partial success."""
    if not data.get(primary_key):
        data["error"] = "AI analysis unavailable - showing partial results"
        return data, True
    return data, False


async def invoke(
    messages: list,
    schema_class: type,
    template,
    label: str,
    user_id: UUID,
) -> dict[str, Any]:
    return await safe_llm_invoke(
        messages,
        fallback=schema_class().model_dump(),
        log_label=label,
        schema_class=schema_class,
        user_id=str(user_id),
        book_id=None,
        template=template,
    )


def completed_log(mode: str, user_id: UUID, t0: float, **counts: int) -> None:
    logger.info(
        f"synthesis.{mode}.completed",
        user_id=str(user_id),
        latency_ms=round((time.monotonic() - t0) * 1000, 1),
        **counts,
    )


def result(data: dict[str, Any], is_fallback: bool) -> dict[str, Any]:
    return {
        "success": not is_fallback,
        "data": data,
        "error": data.get("error") if is_fallback else None,
    }
