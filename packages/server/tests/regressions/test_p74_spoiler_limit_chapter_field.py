"""P7.4 regression (BUG-20260901-007): RAG spoiler limit must use the
CHAPTER index, not the in-chapter page segment.

The leak: ``rag/context.py`` and ``rag/cross_book.py`` derived the
max-chapter filter from ``Book.current_segment`` — the page-segment index
WITHIN the chapter that resets to 0 on every chapter change. A reader on
chapter 1 at segment 4 got ``max_chapter_index=4`` and RAG happily served
chapters 2-4, letting the companion confirm an unread character death
(BND-S05). The mirror bug over-restricted: chapter 5 at segment 0 locked
RAG to chapter 0 alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app.models.book import BookStatus
from app.services.rag.context import _fetch_book_and_spoiler_limit
from app.services.rag.cross_book import _spoiler_limit


@dataclass
class FakeBook:
    """Book stand-in carrying the two fields P7.4 confuses."""

    status: BookStatus | str = BookStatus.reading
    current_page: int = 0   # chapter index
    current_segment: int = 0  # in-chapter page segment (resets each chapter)


def _as_enum(fake: FakeBook) -> FakeBook:
    if isinstance(fake.status, str):
        fake.status = BookStatus(fake.status)
    return fake


class TestCrossBookSpoilerLimit:
    def test_uses_chapter_index_not_segment(self):
        """Chapter 1 @ segment 4 must NOT expose chapters 2-4."""
        book = _as_enum(FakeBook(current_page=1, current_segment=4))
        assert _spoiler_limit(book) == 1

    def test_segment_reset_does_not_lock_rag_to_chapter_zero(self):
        """Chapter 5 @ segment 0 must still allow chapters 0-5."""
        book = _as_enum(FakeBook(current_page=5, current_segment=0))
        assert _spoiler_limit(book) == 5

    def test_completed_book_has_no_limit(self):
        book = _as_enum(FakeBook(status=BookStatus.completed, current_page=3))
        assert _spoiler_limit(book) is None


class TestContextSpoilerLimit:
    """_fetch_book_and_spoiler_limit: same contract through the DB path."""

    @staticmethod
    async def _limit_for(book: FakeBook) -> int | None:
        result = MagicMock()
        result.scalar_one_or_none = lambda: _as_enum(book)
        db = MagicMock()
        db.execute = AsyncMock(return_value=result)
        _, limit = await _fetch_book_and_spoiler_limit(db, uuid4(), uuid4())
        return limit

    async def test_segment_value_never_inflates_chapter_limit(self):
        limit = await TestContextSpoilerLimit._limit_for(
            FakeBook(current_page=1, current_segment=4),
        )
        assert limit == 1  # old code returned 4 here — the BND-S05 leak

    async def test_chapter_progress_survives_segment_reset(self):
        limit = await TestContextSpoilerLimit._limit_for(
            FakeBook(current_page=7, current_segment=0),
        )
        assert limit == 7  # old code returned 0 — silent context starvation

    async def test_completed_book_unfiltered(self):
        limit = await TestContextSpoilerLimit._limit_for(
            FakeBook(status=BookStatus.completed, current_page=2, current_segment=9),
        )
        assert limit is None
