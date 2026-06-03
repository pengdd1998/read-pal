"""Unit tests for reading_session_service — pure business logic with mocked DB.

Tests each public function in reading_session_service.py directly,
isolating service logic from HTTP layer and real database.
"""

import json
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import reading_session_service
from app.models.book import BookStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_session(
    *,
    session_id=None,
    user_id=None,
    book_id=None,
    started_at=None,
    ended_at=None,
    duration=0,
    pages_read=0,
    highlights=0,
    notes=0,
    is_active=True,
    summary=None,
):
    """Create a mock ReadingSession object."""
    sess = MagicMock()
    sess.id = session_id or uuid4()
    sess.user_id = user_id or str(uuid4())
    sess.book_id = book_id or uuid4()
    sess.started_at = started_at or datetime.now(tz=timezone.utc).replace(tzinfo=None)
    sess.ended_at = ended_at
    sess.duration = duration
    sess.pages_read = pages_read
    sess.highlights = highlights
    sess.notes = notes
    sess.summary = summary
    sess.is_active = is_active
    sess.updated_at = None
    return sess


def _make_book(
    *,
    book_id=None,
    user_id=None,
    status='unread',
    total_pages=200,
    current_page=0,
    progress=Decimal('0'),
    scroll_progress=Decimal('0'),
    started_at=None,
):
    """Create a mock Book object."""
    book = MagicMock()
    book.id = book_id or uuid4()
    book.user_id = user_id or str(uuid4())
    book.status = status
    book.total_pages = total_pages
    book.current_page = current_page
    book.progress = progress
    book.scroll_progress = scroll_progress
    book.started_at = started_at
    book.last_read_at = None
    book.completed_at = None
    book.current_segment = None
    return book


def _make_db_session():
    """Create a mock AsyncSession."""
    return AsyncMock(spec=['execute', 'add', 'flush', 'refresh', 'delete', 'scalar'])


def _mock_execute_return(db, value):
    """Wire db.execute to return a result whose scalar_one_or_none returns value."""
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = value
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


def _mock_execute_scalar(db, value):
    """Wire db.scalar to return a value directly."""
    db.scalar = AsyncMock(return_value=value)


def _mock_execute_scalars_all(db, items):
    """Wire db.execute to return a result whose scalars().all() returns items."""
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = items
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


def _make_session_create(book_id=None, started_at=None):
    """Create a mock SessionCreate schema."""
    data = MagicMock()
    data.book_id = book_id or uuid4()
    data.started_at = started_at
    return data


def _make_session_update(**fields):
    """Create a mock SessionUpdate with model_dump support."""
    data = MagicMock()
    data.model_dump.return_value = fields
    return data


# ---------------------------------------------------------------------------
# create_session
# ---------------------------------------------------------------------------


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_creates_session_with_default_started_at(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        data = _make_session_create(book_id=book_id, started_at=None)

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        # Book lookup returns None (book not found path is simplest)
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=book_result)

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 1, 1, 12, 0, 0)
            result = await reading_session_service.create_session(db, user_id, data)

        assert len(added) == 1
        assert added[0].user_id == user_id
        assert added[0].book_id == book_id
        assert added[0].is_active is True
        db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_creates_session_with_explicit_started_at(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        explicit_time = datetime(2026, 3, 15, 10, 30, 0)
        data = _make_session_create(book_id=book_id, started_at=explicit_time)

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=book_result)

        result = await reading_session_service.create_session(db, user_id, data)

        assert added[0].started_at == explicit_time

    @pytest.mark.asyncio
    async def test_updates_book_status_to_reading(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        data = _make_session_create(book_id=book_id)
        book = _make_book(book_id=book_id, user_id=user_id, status='unread')

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        # First execute is for the book lookup
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        db.execute = AsyncMock(return_value=book_result)

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 1, 1, 12, 0, 0)
            result = await reading_session_service.create_session(db, user_id, data)

        assert book.status == BookStatus.reading
        assert book.started_at is not None

    @pytest.mark.asyncio
    async def test_does_not_change_book_already_reading(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        data = _make_session_create(book_id=book_id)
        original_started_at = datetime(2026, 1, 1)
        book = _make_book(
            book_id=book_id, user_id=user_id,
            status=BookStatus.reading, started_at=original_started_at,
        )

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        db.execute = AsyncMock(return_value=book_result)

        await reading_session_service.create_session(db, user_id, data)

        # started_at should not change since it was already set
        assert book.started_at == original_started_at

    @pytest.mark.asyncio
    async def test_handles_book_not_found_gracefully(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        data = _make_session_create(book_id=book_id)

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        # Book not found
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=book_result)

        # Should not raise
        result = await reading_session_service.create_session(db, user_id, data)
        assert len(added) == 1


# ---------------------------------------------------------------------------
# end_session
# ---------------------------------------------------------------------------


class TestEndSession:
    @pytest.mark.asyncio
    async def test_ends_active_session(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        book_id = uuid4()
        started = datetime(2026, 1, 1, 10, 0, 0)
        session = _make_session(
            session_id=session_id, user_id=user_id, book_id=book_id,
            started_at=started, is_active=True,
        )

        _mock_execute_return(db, session)
        db.flush = AsyncMock()

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 1, 1, 11, 0, 0)
            result = await reading_session_service.end_session(db, user_id, session_id)

        assert result is session
        assert result.is_active is False
        assert result.ended_at is not None
        # Duration should be computed from started_at to now
        assert result.duration == 3600

    @pytest.mark.asyncio
    async def test_returns_none_when_session_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        result = await reading_session_service.end_session(db, str(uuid4()), uuid4())

        assert result is None

    @pytest.mark.asyncio
    async def test_does_not_overwrite_existing_duration(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        session = _make_session(
            session_id=session_id, user_id=user_id,
            duration=1800, is_active=True,
        )

        _mock_execute_return(db, session)
        db.flush = AsyncMock()

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 6, 1, 12, 0, 0)
            result = await reading_session_service.end_session(db, user_id, session_id)

        # Duration was already set, should not be recomputed
        assert result.duration == 1800

    @pytest.mark.asyncio
    async def test_updates_book_progress_with_current_page(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        book_id = uuid4()
        session = _make_session(
            session_id=session_id, user_id=user_id, book_id=book_id,
            started_at=datetime(2026, 1, 1, 10, 0, 0), is_active=True,
        )
        book = _make_book(
            book_id=book_id, user_id=user_id,
            total_pages=100, current_page=20,
        )

        # First call returns session, second returns book
        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        db.execute = AsyncMock(side_effect=[session_result, book_result])
        db.flush = AsyncMock()

        data = _make_session_update(current_page=50, total_pages=100)

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 6, 1, 12, 0, 0)
            result = await reading_session_service.end_session(db, user_id, session_id, data)

        assert book.current_page == 50
        assert book.progress == Decimal('50.00')
        assert book.last_read_at is not None

    @pytest.mark.asyncio
    async def test_marks_book_completed_when_last_page_reached(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        book_id = uuid4()
        session = _make_session(
            session_id=session_id, user_id=user_id, book_id=book_id,
            started_at=datetime(2026, 1, 1, 10, 0, 0), is_active=True,
        )
        book = _make_book(
            book_id=book_id, user_id=user_id,
            total_pages=100, current_page=90, status=BookStatus.reading,
        )

        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        db.execute = AsyncMock(side_effect=[session_result, book_result])
        db.flush = AsyncMock()

        data = _make_session_update(current_page=100, total_pages=100)

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 6, 1, 12, 0, 0)
            result = await reading_session_service.end_session(db, user_id, session_id, data)

        assert book.status == BookStatus.completed
        assert book.completed_at is not None
        assert book.progress == Decimal('100')

    @pytest.mark.asyncio
    async def test_without_data_still_ends_session(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        started = datetime(2026, 1, 1, 10, 0, 0)
        session = _make_session(
            session_id=session_id, user_id=user_id,
            started_at=started, is_active=True,
        )

        _mock_execute_return(db, session)
        db.flush = AsyncMock()

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 1, 1, 10, 30, 0)
            result = await reading_session_service.end_session(
                db, user_id, session_id, data=None,
            )

        assert result.is_active is False
        assert result.duration == 1800

    @pytest.mark.asyncio
    async def test_updates_scroll_and_segment_without_page(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        book_id = uuid4()
        session = _make_session(
            session_id=session_id, user_id=user_id, book_id=book_id,
            started_at=datetime(2026, 1, 1, 10, 0, 0), is_active=True,
        )
        book = _make_book(book_id=book_id, user_id=user_id, total_pages=200)

        session_result = MagicMock()
        session_result.scalar_one_or_none.return_value = session
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        db.execute = AsyncMock(side_effect=[session_result, book_result])
        db.flush = AsyncMock()

        data = _make_session_update(
            scroll_progress=0.75, current_segment=42,
        )

        with patch('app.services.reading_session_service.utcnow') as mock_now:
            mock_now.return_value = datetime(2026, 6, 1, 12, 0, 0)
            result = await reading_session_service.end_session(db, user_id, session_id, data)

        assert book.scroll_progress == Decimal('0.750')
        assert book.current_segment == 42


# ---------------------------------------------------------------------------
# get_active_session
# ---------------------------------------------------------------------------


class TestGetActiveSession:
    @pytest.mark.asyncio
    async def test_returns_active_session(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session = _make_session(user_id=user_id, is_active=True)

        _mock_execute_return(db, session)

        result = await reading_session_service.get_active_session(db, user_id)

        assert result is session

    @pytest.mark.asyncio
    async def test_returns_none_when_no_active_session(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        result = await reading_session_service.get_active_session(db, str(uuid4()))

        assert result is None

    @pytest.mark.asyncio
    async def test_filters_by_book_id(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()
        session = _make_session(user_id=user_id, book_id=book_id, is_active=True)

        _mock_execute_return(db, session)

        result = await reading_session_service.get_active_session(db, user_id, book_id=book_id)

        assert result is session
        assert result.book_id == book_id


# ---------------------------------------------------------------------------
# get_sessions
# ---------------------------------------------------------------------------


class TestGetSessions:
    @pytest.mark.asyncio
    async def test_returns_paginated_sessions(self):
        db = _make_db_session()
        user_id = str(uuid4())
        sessions = [_make_session(user_id=user_id) for _ in range(3)]

        # First call: count query, second: data query
        count_result = MagicMock()
        count_result.scalar.return_value = 3
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = sessions
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await reading_session_service.get_sessions(db, user_id)

        assert total == 3
        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_sessions(self):
        db = _make_db_session()
        user_id = str(uuid4())

        count_result = MagicMock()
        count_result.scalar.return_value = 0
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await reading_session_service.get_sessions(db, user_id)

        assert total == 0
        assert result == []

    @pytest.mark.asyncio
    async def test_handles_none_count_as_zero(self):
        db = _make_db_session()
        user_id = str(uuid4())

        count_result = MagicMock()
        count_result.scalar.return_value = None
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await reading_session_service.get_sessions(db, user_id)

        assert total == 0

    @pytest.mark.asyncio
    async def test_filters_by_book_id(self):
        db = _make_db_session()
        user_id = str(uuid4())
        book_id = uuid4()

        count_result = MagicMock()
        count_result.scalar.return_value = 1
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = [
            _make_session(user_id=user_id, book_id=book_id),
        ]
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await reading_session_service.get_sessions(
            db, user_id, book_id=book_id,
        )

        assert total == 1
        assert result[0].book_id == book_id

    @pytest.mark.asyncio
    async def test_respects_pagination(self):
        db = _make_db_session()
        user_id = str(uuid4())

        count_result = MagicMock()
        count_result.scalar.return_value = 50
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = [_make_session()]
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await reading_session_service.get_sessions(
            db, user_id, page=2, per_page=10,
        )

        assert total == 50
        db.execute.assert_awaited()


# ---------------------------------------------------------------------------
# get_session
# ---------------------------------------------------------------------------


class TestGetSession:
    @pytest.mark.asyncio
    async def test_returns_session_when_found(self):
        db = _make_db_session()
        user_id = str(uuid4())
        session_id = uuid4()
        session = _make_session(session_id=session_id, user_id=user_id)

        _mock_execute_return(db, session)

        result = await reading_session_service.get_session(db, user_id, session_id)

        assert result is session

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        result = await reading_session_service.get_session(db, str(uuid4()), uuid4())

        assert result is None


# ---------------------------------------------------------------------------
# get_session_stats
# ---------------------------------------------------------------------------


class TestGetSessionStats:
    @pytest.mark.asyncio
    async def test_returns_aggregate_stats(self):
        db = _make_db_session()
        user_id = str(uuid4())

        row = MagicMock()
        row.sessions = 10
        row.duration = 36000
        row.pages = 150
        row.highlights = 45
        row.notes = 12

        result_mock = MagicMock()
        result_mock.one.return_value = row
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.core.redis.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None  # cache miss
            mock_redis_fn.return_value = mock_redis

            stats = await reading_session_service.get_session_stats(db, user_id)

        assert stats['total_sessions'] == 10
        assert stats['total_duration'] == 36000
        assert stats['total_pages_read'] == 150
        assert stats['total_highlights'] == 45
        assert stats['total_notes'] == 12

    @pytest.mark.asyncio
    async def test_returns_cached_stats(self):
        db = _make_db_session()
        user_id = str(uuid4())

        cached_data = {
            'total_sessions': 5,
            'total_duration': 1800,
            'total_pages_read': 60,
            'total_highlights': 10,
            'total_notes': 2,
        }

        with patch('app.core.redis.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = json.dumps(cached_data)
            mock_redis_fn.return_value = mock_redis

            stats = await reading_session_service.get_session_stats(db, user_id)

        assert stats == cached_data
        # DB should NOT be queried when cache hits
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_graceful_fallback_when_redis_unavailable(self):
        db = _make_db_session()
        user_id = str(uuid4())

        row = MagicMock()
        row.sessions = 0
        row.duration = 0
        row.pages = 0
        row.highlights = 0
        row.notes = 0

        result_mock = MagicMock()
        result_mock.one.return_value = row
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.core.redis.get_redis') as mock_redis_fn:
            mock_redis_fn.side_effect = Exception('Redis connection refused')

            stats = await reading_session_service.get_session_stats(db, user_id)

        # Should still return stats from DB
        assert stats['total_sessions'] == 0
        assert stats['total_duration'] == 0

    @pytest.mark.asyncio
    async def test_caches_result_after_db_query(self):
        db = _make_db_session()
        user_id = str(uuid4())

        row = MagicMock()
        row.sessions = 3
        row.duration = 900
        row.pages = 30
        row.highlights = 5
        row.notes = 1

        result_mock = MagicMock()
        result_mock.one.return_value = row
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.core.redis.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None  # cache miss
            mock_redis_fn.return_value = mock_redis

            stats = await reading_session_service.get_session_stats(db, user_id)

        # Verify cache was written
        mock_redis.setex.assert_awaited_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][0] == f'stats:sessions:{user_id}'
        assert call_args[0][1] == 300


# ---------------------------------------------------------------------------
# build_session_summary (pure function)
# ---------------------------------------------------------------------------


class TestBuildSessionSummary:
    def test_full_summary(self):
        session = _make_session(duration=600, pages_read=20, highlights=3, notes=1)

        summary = reading_session_service.build_session_summary(session)

        assert '10 minutes' in summary
        assert '20 pages' in summary
        assert '3 highlights' in summary
        assert '1 note' in summary

    def test_singular_forms(self):
        session = _make_session(duration=60, pages_read=1, highlights=1, notes=1)

        summary = reading_session_service.build_session_summary(session)

        assert '1 minute' in summary
        assert '1 page' in summary
        assert '1 highlight' in summary
        assert '1 note' in summary

    def test_empty_session(self):
        session = _make_session(duration=0, pages_read=0, highlights=0, notes=0)

        summary = reading_session_service.build_session_summary(session)

        assert summary == 'Session recorded successfully.'

    def test_partial_session_only_duration(self):
        session = _make_session(duration=120, pages_read=0, highlights=0, notes=0)

        summary = reading_session_service.build_session_summary(session)

        assert '2 minutes' in summary
        assert 'page' not in summary.lower()

    def test_handles_none_values(self):
        session = MagicMock()
        session.duration = None
        session.pages_read = None
        session.highlights = None
        session.notes = None

        summary = reading_session_service.build_session_summary(session)

        assert summary == 'Session recorded successfully.'


# ---------------------------------------------------------------------------
# get_book_session_log
# ---------------------------------------------------------------------------


class TestGetBookSessionLog:
    @pytest.mark.asyncio
    async def test_returns_paginated_sessions_for_book(self):
        db = _make_db_session()
        user_id = uuid4()
        book_id = uuid4()
        sessions = [_make_session(user_id=user_id, book_id=book_id) for _ in range(2)]

        _mock_execute_scalar(db, 2)
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = sessions
        db.execute = AsyncMock(return_value=data_result)

        result, total = await reading_session_service.get_book_session_log(
            db, user_id, book_id,
        )

        assert total == 2
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_sessions(self):
        db = _make_db_session()
        user_id = uuid4()
        book_id = uuid4()

        _mock_execute_scalar(db, 0)
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=data_result)

        result, total = await reading_session_service.get_book_session_log(
            db, user_id, book_id,
        )

        assert total == 0
        assert result == []

    @pytest.mark.asyncio
    async def test_handles_none_total_as_zero(self):
        db = _make_db_session()
        user_id = uuid4()
        book_id = uuid4()

        _mock_execute_scalar(db, None)
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=data_result)

        result, total = await reading_session_service.get_book_session_log(
            db, user_id, book_id,
        )

        assert total == 0
