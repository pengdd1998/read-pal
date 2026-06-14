"""Tests for app/services/_session_book_progress.py helpers."""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models.book import BookStatus
from app.services._session_book_progress import (
    cap_progress,
    update_book_completion,
    update_book_heartbeat,
    update_book_scroll_only,
    update_book_with_page,
)


def _make_book(
    *,
    total_pages=200,
    current_page=50,
    progress=Decimal('25'),
    scroll_progress=Decimal('0'),
    status=BookStatus.reading,
    completed_at=None,
):
    book = MagicMock()
    book.id = uuid4()
    book.user_id = str(uuid4())
    book.total_pages = total_pages
    book.current_page = current_page
    book.progress = progress
    book.scroll_progress = scroll_progress
    book.current_segment = None
    book.status = status
    book.completed_at = completed_at
    book.last_read_at = None
    return book


def _mock_db_with_book(book):
    """Mock AsyncSession whose first execute returns the given book."""
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = book
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# cap_progress
# ---------------------------------------------------------------------------


def test_cap_progress_below_100_unchanged():
    assert cap_progress(Decimal('42.5')) == Decimal('42.5')


def test_cap_progress_above_100_clamped():
    assert cap_progress(Decimal('150')) == Decimal('100')


# ---------------------------------------------------------------------------
# update_book_completion
# ---------------------------------------------------------------------------


def test_update_book_completion_marks_completed_at_last_page():
    book = _make_book(total_pages=100, current_page=100, status=BookStatus.reading)
    now = datetime.now(tz=timezone.utc)
    update_book_completion(book, now)
    assert book.status == BookStatus.completed
    assert book.progress == Decimal('100')
    assert book.completed_at == now


def test_update_book_completion_skips_already_completed():
    """No-op when already completed — completed_at should not move."""
    original_completed = datetime(2026, 1, 1, tzinfo=timezone.utc)
    book = _make_book(total_pages=100, current_page=100, status=BookStatus.completed, completed_at=original_completed)
    update_book_completion(book, datetime.now(tz=timezone.utc))
    assert book.completed_at == original_completed  # unchanged


def test_update_book_completion_skips_when_not_at_last_page():
    book = _make_book(total_pages=100, current_page=50, status=BookStatus.reading)
    update_book_completion(book, datetime.now(tz=timezone.utc))
    assert book.status == BookStatus.reading


# ---------------------------------------------------------------------------
# update_book_with_page
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_book_with_page_advances_progress():
    book = _make_book(total_pages=100, current_page=20, progress=Decimal('20'))
    db = _mock_db_with_book(book)
    now = datetime.now(tz=timezone.utc)

    await update_book_with_page(db, book.id, book.user_id, now, current_page=50,
                                 scroll_progress=0.5, current_segment=3)

    assert book.current_page == 50
    assert book.progress == Decimal('50.00')
    assert book.scroll_progress == Decimal('0.5')
    assert book.current_segment == 3
    assert book.last_read_at == now


@pytest.mark.asyncio
async def test_update_book_with_page_does_not_rewind_completed_book():
    """User reopens completed book at page 1 — progress must NOT rewind."""
    book = _make_book(
        total_pages=100,
        current_page=100,
        progress=Decimal('100'),
        status=BookStatus.completed,
        completed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    db = _mock_db_with_book(book)
    now = datetime.now(tz=timezone.utc)

    await update_book_with_page(db, book.id, book.user_id, now, current_page=1,
                                 scroll_progress=0.0, current_segment=0)

    # Page and progress preserved
    assert book.current_page == 100
    assert book.progress == Decimal('100')
    assert book.status == BookStatus.completed
    # But scroll/last_read_at still updated
    assert book.scroll_progress == Decimal('0')
    assert book.last_read_at == now


@pytest.mark.asyncio
async def test_update_book_with_page_same_page_does_not_rewind():
    """Receiving the same page (e.g. re-opened at last position) is fine."""
    book = _make_book(total_pages=100, current_page=50, progress=Decimal('50'))
    db = _mock_db_with_book(book)
    now = datetime.now(tz=timezone.utc)

    await update_book_with_page(db, book.id, book.user_id, now, current_page=50,
                                 scroll_progress=None, current_segment=None)

    assert book.current_page == 50
    assert book.progress == Decimal('50.00')


@pytest.mark.asyncio
async def test_update_book_with_page_skips_when_book_not_found():
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    # Should not raise
    await update_book_with_page(db, uuid4(), 'user', datetime.now(tz=timezone.utc),
                                 current_page=10, scroll_progress=None, current_segment=None)


@pytest.mark.asyncio
async def test_update_book_with_page_clamps_oversized_page():
    book = _make_book(total_pages=100, current_page=50, progress=Decimal('50'))
    db = _mock_db_with_book(book)

    await update_book_with_page(db, book.id, book.user_id, datetime.now(tz=timezone.utc),
                                 current_page=999, scroll_progress=None, current_segment=None)

    assert book.current_page == 100
    assert book.progress == Decimal('100')
    assert book.status == BookStatus.completed


# ---------------------------------------------------------------------------
# update_book_scroll_only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_book_scroll_only_does_not_touch_page():
    book = _make_book(total_pages=100, current_page=30, progress=Decimal('30'))
    db = _mock_db_with_book(book)

    await update_book_scroll_only(db, book.id, book.user_id, datetime.now(tz=timezone.utc),
                                   scroll_progress=0.7, current_segment=5)

    assert book.current_page == 30  # unchanged
    assert book.progress == Decimal('30')  # unchanged
    assert book.scroll_progress == Decimal('0.7')
    assert book.current_segment == 5


# ---------------------------------------------------------------------------
# update_book_heartbeat
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_book_heartbeat_advances_page_when_ahead():
    book = _make_book(total_pages=100, current_page=20, progress=Decimal('20'))
    db = _mock_db_with_book(book)

    await update_book_heartbeat(db, book.id, book.user_id,
                                 pages_read=50, session_pages_read=50,
                                 scroll_progress=0.5, current_segment=3)

    # pages_read=50 → heartbeat_page = 49
    assert book.current_page == 49
    assert book.progress == Decimal('49.00')


@pytest.mark.asyncio
async def test_update_book_heartbeat_skips_when_not_ahead():
    """Heartbeat reporting an earlier page does NOT rewind."""
    book = _make_book(total_pages=100, current_page=50, progress=Decimal('50'))
    db = _mock_db_with_book(book)

    await update_book_heartbeat(db, book.id, book.user_id,
                                 pages_read=20, session_pages_read=20,
                                 scroll_progress=0.1, current_segment=0)

    assert book.current_page == 50  # unchanged
    assert book.progress == Decimal('50')  # unchanged
    # But scroll still updates
    assert book.scroll_progress == Decimal('0.1')
