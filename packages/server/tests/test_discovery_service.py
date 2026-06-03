"""Unit tests for discovery_service — pure business logic with mocked DB.

Tests each public function in discovery_service.py directly,
isolating service logic from HTTP layer and real database.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import discovery_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_book(
    *,
    book_id=None,
    title='Test Book',
    author='Author Name',
    cover_url=None,
    file_type='epub',
    total_pages=200,
    current_page=0,
    progress=0.0,
    status='reading',
    tags=None,
    user_id=None,
):
    """Create a mock Book object."""
    book = MagicMock()
    book.id = book_id or uuid4()
    book.title = title
    book.author = author
    book.cover_url = cover_url
    book.file_type = file_type
    book.total_pages = total_pages
    book.current_page = current_page
    book.progress = progress
    book.status = status
    book.tags = tags or []
    book.user_id = user_id or uuid4()
    book.last_read_at = None
    book.added_at = None
    return book


def _make_db_session():
    """Create a mock AsyncSession."""
    return AsyncMock(spec=['execute', 'add', 'flush', 'refresh', 'delete'])


def _mock_execute_scalars_all(db, items):
    """Wire db.execute to return a result whose scalars().all() returns items."""
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = items
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


def _mock_execute_scalar_one(db, value):
    """Wire db.execute to return a result whose scalar_one returns value."""
    result_mock = MagicMock()
    result_mock.scalar_one.return_value = value
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


# ---------------------------------------------------------------------------
# _escape_like
# ---------------------------------------------------------------------------


class TestEscapeLike:
    def test_escapes_percent(self):
        assert discovery_service._escape_like('100%') == r'100\%'

    def test_escapes_underscore(self):
        assert discovery_service._escape_like('test_value') == r'test\_value'

    def test_escapes_both(self):
        assert discovery_service._escape_like('a_b%c') == r'a\_b\%c'

    def test_no_special_chars(self):
        assert discovery_service._escape_like('hello') == 'hello'

    def test_empty_string(self):
        assert discovery_service._escape_like('') == ''


# ---------------------------------------------------------------------------
# _book_to_dict
# ---------------------------------------------------------------------------


class TestBookToDict:
    def test_serializes_all_fields(self):
        book_id = uuid4()
        book = _make_book(
            book_id=book_id, title='Gatsby', author='Fitzgerald',
            cover_url='http://example.com/cover.jpg', file_type='epub',
            total_pages=180, current_page=50, progress=27.78,
            status='reading', tags=['classic', 'fiction'],
        )

        result = discovery_service._book_to_dict(book)

        assert result['id'] == str(book_id)
        assert result['title'] == 'Gatsby'
        assert result['author'] == 'Fitzgerald'
        assert result['coverUrl'] == 'http://example.com/cover.jpg'
        assert result['fileType'] == 'epub'
        assert result['totalPages'] == 180
        assert result['currentPage'] == 50
        assert result['progress'] == 27.78
        assert result['status'] == 'reading'
        assert result['tags'] == ['classic', 'fiction']

    def test_handles_none_tags(self):
        book = _make_book(tags=None)

        result = discovery_service._book_to_dict(book)

        assert result['tags'] == []

    def test_converts_id_to_string(self):
        book_id = uuid4()
        book = _make_book(book_id=book_id)

        result = discovery_service._book_to_dict(book)

        assert isinstance(result['id'], str)
        assert result['id'] == str(book_id)


# ---------------------------------------------------------------------------
# search_books
# ---------------------------------------------------------------------------


class TestSearchBooks:
    @pytest.mark.asyncio
    async def test_search_with_query(self):
        db = _make_db_session()
        user_id = uuid4()
        books = [
            _make_book(title='The Great Gatsby', user_id=user_id),
            _make_book(title='Great Expectations', user_id=user_id),
        ]

        # First call: count, second: data
        count_result = MagicMock()
        count_result.scalar_one.return_value = 2
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = books
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.search_books(
            db, user_id, 'Great', page=1, limit=10,
        )

        assert total == 2
        assert len(result) == 2
        assert result[0]['title'] == 'The Great Gatsby'

    @pytest.mark.asyncio
    async def test_empty_query_returns_recent_books(self):
        db = _make_db_session()
        user_id = uuid4()
        books = [_make_book(user_id=user_id)]

        count_result = MagicMock()
        count_result.scalar_one.return_value = 1
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = books
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.search_books(
            db, user_id, '', page=1, limit=10,
        )

        assert total == 1
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_whitespace_only_query_returns_recent(self):
        db = _make_db_session()
        user_id = uuid4()

        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.search_books(
            db, user_id, '   ', page=1, limit=10,
        )

        assert total == 0
        assert result == []

    @pytest.mark.asyncio
    async def test_pagination_offset(self):
        db = _make_db_session()
        user_id = uuid4()

        count_result = MagicMock()
        count_result.scalar_one.return_value = 25
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = [_make_book()]
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.search_books(
            db, user_id, 'test', page=3, limit=5,
        )

        assert total == 25
        db.execute.assert_awaited()

    @pytest.mark.asyncio
    async def test_search_escapes_special_chars(self):
        db = _make_db_session()
        user_id = uuid4()

        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.search_books(
            db, user_id, '100% real_test', page=1, limit=10,
        )

        assert total == 0


# ---------------------------------------------------------------------------
# semantic_search_books
# ---------------------------------------------------------------------------


class TestSemanticSearchBooks:
    @pytest.mark.asyncio
    async def test_search_with_query(self):
        db = _make_db_session()
        user_id = uuid4()
        books = [_make_book(title='Deep Learning', user_id=user_id)]

        count_result = MagicMock()
        count_result.scalar_one.return_value = 1
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = books
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.semantic_search_books(
            db, user_id, 'Learning', page=1, limit=10,
        )

        assert total == 1
        assert len(result) == 1
        assert result[0]['title'] == 'Deep Learning'

    @pytest.mark.asyncio
    async def test_empty_query_returns_recent(self):
        db = _make_db_session()
        user_id = uuid4()

        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.semantic_search_books(
            db, user_id, '', page=1, limit=10,
        )

        assert total == 0
        assert result == []

    @pytest.mark.asyncio
    async def test_search_includes_annotation_matches(self):
        db = _make_db_session()
        user_id = uuid4()
        books = [_make_book(title='Math Basics', user_id=user_id)]

        count_result = MagicMock()
        count_result.scalar_one.return_value = 1
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = books
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        # The query uses a subquery on annotations — we just verify it runs
        result, total = await discovery_service.semantic_search_books(
            db, user_id, 'calculus', page=1, limit=10,
        )

        assert db.execute.call_count == 2

    @pytest.mark.asyncio
    async def test_pagination(self):
        db = _make_db_session()
        user_id = uuid4()

        count_result = MagicMock()
        count_result.scalar_one.return_value = 100
        data_result = MagicMock()
        data_result.scalars.return_value.all.return_value = [_make_book()]
        db.execute = AsyncMock(side_effect=[count_result, data_result])

        result, total = await discovery_service.semantic_search_books(
            db, user_id, 'test', page=5, limit=20,
        )

        assert total == 100


# ---------------------------------------------------------------------------
# get_free_books
# ---------------------------------------------------------------------------


class TestGetFreeBooks:
    @pytest.mark.asyncio
    async def test_returns_popular_completed_books(self):
        db = _make_db_session()

        row1 = MagicMock()
        row1.title = 'The Great Gatsby'
        row1.author = 'Fitzgerald'
        row1.cover_url = 'cover1.jpg'
        row1.reader_count = 10

        row2 = MagicMock()
        row2.title = '1984'
        row2.author = 'Orwell'
        row2.cover_url = 'cover2.jpg'
        row2.reader_count = 8

        result_mock = MagicMock()
        result_mock.all.return_value = [row1, row2]
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.services.discovery_service.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None  # cache miss
            mock_redis_fn.return_value = mock_redis

            result = await discovery_service.get_free_books(db)

        assert len(result) == 2
        assert result[0]['title'] == 'The Great Gatsby'
        assert result[0]['readerCount'] == 10
        assert result[1]['title'] == '1984'
        assert result[1]['readerCount'] == 8

    @pytest.mark.asyncio
    async def test_returns_cached_result(self):
        db = _make_db_session()

        cached = [
            {'title': 'Cached Book', 'author': 'Author', 'coverUrl': None, 'readerCount': 5},
        ]

        with patch('app.services.discovery_service.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = json.dumps(cached)
            mock_redis_fn.return_value = mock_redis

            result = await discovery_service.get_free_books(db)

        assert result == cached
        # DB should NOT be queried
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_completed_books(self):
        db = _make_db_session()

        result_mock = MagicMock()
        result_mock.all.return_value = []
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.services.discovery_service.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None
            mock_redis_fn.return_value = mock_redis

            result = await discovery_service.get_free_books(db)

        assert result == []

    @pytest.mark.asyncio
    async def test_falls_back_when_redis_unavailable_on_read(self):
        db = _make_db_session()

        row = MagicMock()
        row.title = 'Fallback Book'
        row.author = 'Author'
        row.cover_url = None
        row.reader_count = 3

        result_mock = MagicMock()
        result_mock.all.return_value = [row]
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.services.discovery_service.get_redis') as mock_redis_fn:
            mock_redis_fn.side_effect = Exception('Connection refused')

            result = await discovery_service.get_free_books(db)

        assert len(result) == 1
        assert result[0]['title'] == 'Fallback Book'

    @pytest.mark.asyncio
    async def test_falls_back_when_redis_unavailable_on_write(self):
        db = _make_db_session()

        row = MagicMock()
        row.title = 'Write Fallback'
        row.author = 'Author'
        row.cover_url = None
        row.reader_count = 2

        result_mock = MagicMock()
        result_mock.all.return_value = [row]
        db.execute = AsyncMock(return_value=result_mock)

        call_count = [0]

        def redis_factory():
            call_count[0] += 1
            if call_count[0] == 1:
                # First call (read) succeeds with cache miss
                mock_redis = AsyncMock()
                mock_redis.get.return_value = None
                return mock_redis
            # Second call (write) fails
            raise Exception('Write failed')

        with patch('app.services.discovery_service.get_redis', side_effect=redis_factory):
            result = await discovery_service.get_free_books(db)

        # Should still return results even if cache write fails
        assert len(result) == 1
        assert result[0]['title'] == 'Write Fallback'

    @pytest.mark.asyncio
    async def test_caches_result_after_db_query(self):
        db = _make_db_session()

        row = MagicMock()
        row.title = 'To Cache'
        row.author = 'Author'
        row.cover_url = None
        row.reader_count = 7

        result_mock = MagicMock()
        result_mock.all.return_value = [row]
        db.execute = AsyncMock(return_value=result_mock)

        with patch('app.services.discovery_service.get_redis') as mock_redis_fn:
            mock_redis = AsyncMock()
            mock_redis.get.return_value = None  # cache miss
            mock_redis_fn.return_value = mock_redis

            result = await discovery_service.get_free_books(db)

        mock_redis.setex.assert_awaited_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][0] == 'discovery:free_books'
        assert call_args[0][1] == 300  # 5 minutes TTL
