"""Unit tests for collection_service — pure business logic with mocked DB.

Tests each public function in collection_service.py directly,
isolating service logic from HTTP layer and real database.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services import collection_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_collection(
    *,
    collection_id=None,
    user_id=None,
    name='My Collection',
    description=None,
    icon='folder',
    color='#f59e0b',
    book_ids=None,
):
    """Create a mock Collection object."""
    coll = MagicMock()
    coll.id = collection_id or uuid4()
    coll.user_id = user_id or uuid4()
    coll.name = name
    coll.description = description
    coll.icon = icon
    coll.color = color
    coll.book_ids = book_ids or []
    return coll


def _make_db_session():
    """Create a mock AsyncSession."""
    return AsyncMock(spec=['execute', 'add', 'flush', 'refresh', 'delete'])


def _mock_execute_return(db, value):
    """Wire db.execute to return a result whose scalar_one_or_none returns value."""
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = value
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


def _mock_execute_collection_then_books(db, collection, book_ids):
    """Wire db.execute to handle the ownership-check + collection fetch sequence.

    The first call (collection fetch) returns via scalar_one_or_none.
    The second call (book ownership check) returns rows via .all().
    """
    coll_result = MagicMock()
    coll_result.scalar_one_or_none.return_value = collection

    book_result = MagicMock()
    book_result.all.return_value = [(bid,) for bid in book_ids]

    db.execute = AsyncMock(side_effect=[coll_result, book_result])


def _mock_execute_scalars_all(db, items):
    """Wire db.execute to return a result whose scalars().all() returns items."""
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = items
    db.execute = AsyncMock(return_value=result_mock)
    return result_mock


def _make_create_data(name='Test', description=None, icon=None, color=None):
    """Create a mock CollectionCreate schema."""
    data = MagicMock()
    data.name = name
    data.description = description
    data.icon = icon
    data.color = color
    return data


def _make_update_data(**fields):
    """Create a mock CollectionUpdate schema with model_dump support."""
    data = MagicMock()
    data.model_dump.return_value = fields
    return data


# ---------------------------------------------------------------------------
# create_collection
# ---------------------------------------------------------------------------


class TestCreateCollection:
    @pytest.mark.asyncio
    async def test_creates_collection_with_defaults(self):
        db = _make_db_session()
        user_id = uuid4()
        data = _make_create_data(name='Favorites')

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        result = await collection_service.create_collection(db, user_id, data)

        assert len(added) == 1
        assert added[0].user_id == user_id
        assert added[0].name == 'Favorites'
        assert added[0].icon == 'folder'
        assert added[0].color == '#f59e0b'
        assert added[0].book_ids == []
        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_creates_collection_with_custom_icon_and_color(self):
        db = _make_db_session()
        user_id = uuid4()
        data = _make_create_data(
            name='Sci-Fi',
            description='Science fiction books',
            icon='rocket',
            color='#3b82f6',
        )

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        result = await collection_service.create_collection(db, user_id, data)

        assert added[0].name == 'Sci-Fi'
        assert added[0].description == 'Science fiction books'
        assert added[0].icon == 'rocket'
        assert added[0].color == '#3b82f6'

    @pytest.mark.asyncio
    async def test_create_with_no_icon_uses_default(self):
        db = _make_db_session()
        user_id = uuid4()
        data = _make_create_data(name='Empty Icon', icon=None)

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.create_collection(db, user_id, data)

        assert added[0].icon == 'folder'

    @pytest.mark.asyncio
    async def test_create_with_no_color_uses_default(self):
        db = _make_db_session()
        user_id = uuid4()
        data = _make_create_data(name='Empty Color', color=None)

        added = []
        db.add = lambda obj: added.append(obj)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.create_collection(db, user_id, data)

        assert added[0].color == '#f59e0b'


# ---------------------------------------------------------------------------
# get_collection
# ---------------------------------------------------------------------------


class TestGetCollection:
    @pytest.mark.asyncio
    async def test_returns_collection_when_found(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        expected = _make_collection(collection_id=collection_id, user_id=user_id)

        _mock_execute_return(db, expected)

        result = await collection_service.get_collection(db, user_id, collection_id)

        assert result is expected
        assert result.id == collection_id

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        result = await collection_service.get_collection(db, uuid4(), uuid4())

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_wrong_user(self):
        db = _make_db_session()
        # DB query filters by user_id, so wrong user yields None
        _mock_execute_return(db, None)

        result = await collection_service.get_collection(db, uuid4(), uuid4())

        assert result is None


# ---------------------------------------------------------------------------
# list_collections
# ---------------------------------------------------------------------------


class TestListCollections:
    @pytest.mark.asyncio
    async def test_returns_all_user_collections(self):
        db = _make_db_session()
        user_id = uuid4()
        collections = [
            _make_collection(user_id=user_id, name='A'),
            _make_collection(user_id=user_id, name='B'),
        ]

        _mock_execute_count_then_scalars(db, total=len(collections), items=collections)

        items, total = await collection_service.list_collections(db, user_id)

        assert total == 2
        assert items == collections

    @pytest.mark.asyncio
    async def test_returns_empty_list_for_no_collections(self):
        db = _make_db_session()
        _mock_execute_count_then_scalars(db, total=0, items=[])

        items, total = await collection_service.list_collections(db, uuid4())

        assert items == []
        assert total == 0

    @pytest.mark.asyncio
    async def test_passes_offset_and_limit(self):
        """Pagination params must reach the query as offset/limit."""
        db = _make_db_session()
        user_id = uuid4()
        _mock_execute_count_then_scalars(db, total=10, items=[])

        await collection_service.list_collections(db, user_id, page=3, per_page=4)

        stmt = db.execute.await_args_list[1].args[0]
        compiled = stmt.compile()
        # offset = (page - 1) * per_page = 8, limit = per_page = 4
        # (param names/order vary across SQLAlchemy versions — assert values only)
        assert sorted(v for v in compiled.params.values() if isinstance(v, int)) == [4, 8]


# ---------------------------------------------------------------------------
# Test helpers (pagination) — placed after TestListCollections to stay near use
# ---------------------------------------------------------------------------


def _mock_execute_count_then_scalars(db, *, total: int, items: list):
    """Wire db.execute for the count + page query sequence of list_collections.

    The first call returns the count scalar; the second returns the page of items.
    """
    count_result = MagicMock()
    count_result.scalar.return_value = total

    items_result = MagicMock()
    items_result.scalars.return_value.all.return_value = items

    db.execute = AsyncMock(side_effect=[count_result, items_result])


# ---------------------------------------------------------------------------
# update_collection
# ---------------------------------------------------------------------------


class TestUpdateCollection:
    @pytest.mark.asyncio
    async def test_updates_name(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing = _make_collection(collection_id=collection_id, user_id=user_id)

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        data = _make_update_data(name='Renamed')

        result = await collection_service.update_collection(db, user_id, collection_id, data)

        assert result is existing
        assert existing.name == 'Renamed'
        db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_updates_multiple_fields(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing = _make_collection(collection_id=collection_id, user_id=user_id)

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        data = _make_update_data(
            name='New Name',
            description='New description',
            color='#ff0000',
            icon='star',
        )

        result = await collection_service.update_collection(db, user_id, collection_id, data)

        assert existing.name == 'New Name'
        assert existing.description == 'New description'
        assert existing.color == '#ff0000'
        assert existing.icon == 'star'

    @pytest.mark.asyncio
    async def test_raises_when_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        data = _make_update_data(name='X')

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.update_collection(db, uuid4(), uuid4(), data)


# ---------------------------------------------------------------------------
# delete_collection
# ---------------------------------------------------------------------------


class TestDeleteCollection:
    @pytest.mark.asyncio
    async def test_deletes_existing_collection(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing = _make_collection(collection_id=collection_id, user_id=user_id)

        _mock_execute_return(db, existing)
        db.delete = AsyncMock()
        db.flush = AsyncMock()

        await collection_service.delete_collection(db, user_id, collection_id)

        db.delete.assert_awaited_once_with(existing)
        db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_raises_when_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.delete_collection(db, uuid4(), uuid4())


# ---------------------------------------------------------------------------
# add_book_to_collection
# ---------------------------------------------------------------------------


class TestAddBookToCollection:
    @pytest.mark.asyncio
    async def test_adds_book_to_empty_collection(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        book_id = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[],
        )

        _mock_execute_collection_then_books(db, existing, [book_id])
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        result = await collection_service.add_book_to_collection(
            db, user_id, collection_id, book_id,
        )

        assert book_id in existing.book_ids

    @pytest.mark.asyncio
    async def test_adds_book_without_duplicate(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        book_id = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[book_id],
        )

        _mock_execute_collection_then_books(db, existing, [book_id])
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.add_book_to_collection(
            db, user_id, collection_id, book_id,
        )

        # Should not duplicate
        assert existing.book_ids.count(book_id) == 1

    @pytest.mark.asyncio
    async def test_raises_when_collection_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.add_book_to_collection(db, uuid4(), uuid4(), uuid4())

    @pytest.mark.asyncio
    async def test_handles_none_book_ids(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        book_id = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=None,
        )

        _mock_execute_collection_then_books(db, existing, [book_id])
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.add_book_to_collection(
            db, user_id, collection_id, book_id,
        )

        assert book_id in existing.book_ids


# ---------------------------------------------------------------------------
# add_books_batch
# ---------------------------------------------------------------------------


class TestAddBooksBatch:
    @pytest.mark.asyncio
    async def test_adds_multiple_books(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        book_ids = [uuid4(), uuid4(), uuid4()]
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[],
        )

        _mock_execute_collection_then_books(db, existing, book_ids)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.add_books_batch(
            db, user_id, collection_id, book_ids,
        )

        for bid in book_ids:
            assert bid in existing.book_ids

    @pytest.mark.asyncio
    async def test_deduplicates_when_adding_existing(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing_book = uuid4()
        new_book = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[existing_book],
        )

        _mock_execute_collection_then_books(db, existing, [existing_book, new_book])
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.add_books_batch(
            db, user_id, collection_id, [existing_book, new_book],
        )

        assert existing_book in existing.book_ids
        assert new_book in existing.book_ids
        assert existing.book_ids.count(existing_book) == 1

    @pytest.mark.asyncio
    async def test_raises_when_collection_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.add_books_batch(db, uuid4(), uuid4(), [uuid4()])


# ---------------------------------------------------------------------------
# remove_book_from_collection
# ---------------------------------------------------------------------------


class TestRemoveBookFromCollection:
    @pytest.mark.asyncio
    async def test_removes_existing_book(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        book_id = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[book_id],
        )

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.remove_book_from_collection(
            db, user_id, collection_id, book_id,
        )

        assert book_id not in existing.book_ids

    @pytest.mark.asyncio
    async def test_no_error_removing_nonexistent_book(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing_book = uuid4()
        other_book = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[existing_book],
        )

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.remove_book_from_collection(
            db, user_id, collection_id, other_book,
        )

        assert existing_book in existing.book_ids
        assert other_book not in existing.book_ids

    @pytest.mark.asyncio
    async def test_raises_when_collection_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.remove_book_from_collection(db, uuid4(), uuid4(), uuid4())


# ---------------------------------------------------------------------------
# remove_books_batch
# ---------------------------------------------------------------------------


class TestRemoveBooksBatch:
    @pytest.mark.asyncio
    async def test_removes_multiple_books(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        keep = uuid4()
        remove1 = uuid4()
        remove2 = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id,
            book_ids=[keep, remove1, remove2],
        )

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.remove_books_batch(
            db, user_id, collection_id, [remove1, remove2],
        )

        assert keep in existing.book_ids
        assert remove1 not in existing.book_ids
        assert remove2 not in existing.book_ids

    @pytest.mark.asyncio
    async def test_removing_nonexistent_books_is_noop(self):
        db = _make_db_session()
        user_id = uuid4()
        collection_id = uuid4()
        existing_book = uuid4()
        existing = _make_collection(
            collection_id=collection_id, user_id=user_id, book_ids=[existing_book],
        )

        _mock_execute_return(db, existing)
        db.flush = AsyncMock()
        db.refresh = AsyncMock()

        await collection_service.remove_books_batch(
            db, user_id, collection_id, [uuid4(), uuid4()],
        )

        assert existing_book in existing.book_ids
        assert len(existing.book_ids) == 1

    @pytest.mark.asyncio
    async def test_raises_when_collection_not_found(self):
        db = _make_db_session()
        _mock_execute_return(db, None)

        with pytest.raises(ValueError, match='Collection not found'):
            await collection_service.remove_books_batch(db, uuid4(), uuid4(), [uuid4()])
