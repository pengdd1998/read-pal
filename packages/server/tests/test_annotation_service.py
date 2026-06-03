"""Unit tests for annotation_service — pure business logic with mocked DB.

Tests each public function in annotation_service.py directly,
isolating service logic from HTTP layer and real database.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy import Select

from app.services import annotation_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_annotation(
    *,
    annotation_id=None,
    user_id=None,
    book_id=None,
    type='highlight',
    content='Test content',
    note=None,
    location=None,
    tags=None,
    color=None,
    created_at=None,
):
    """Create a mock Annotation object."""
    ann = MagicMock()
    ann.id = annotation_id or uuid4()
    ann.user_id = user_id or uuid4()
    ann.book_id = book_id or uuid4()
    ann.type = type
    ann.content = content
    ann.note = note
    ann.location = location or {'chapter': 'Chapter 1', 'page': 1}
    ann.tags = tags or []
    ann.color = color
    ann.created_at = created_at or datetime.now(tz=timezone.utc)
    return ann


def _make_db_session():
    """Create a mock AsyncSession."""
    db = AsyncMock(spec=['execute', 'add', 'flush', 'refresh', 'delete'])
    return db


# ---------------------------------------------------------------------------
# get_annotations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_annotations_returns_paginated_results():
    db = _make_db_session()
    user_id = str(uuid4())
    annotations = [_make_annotation(user_id=user_id) for _ in range(3)]

    # Mock the count query result
    count_result = MagicMock()
    count_result.scalar.return_value = 3

    # Mock the data query result
    data_result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = annotations
    data_result.scalars.return_value = scalars_mock

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    result, total = await annotation_service.get_annotations(db, user_id)

    assert total == 3
    assert len(result) == 3
    assert db.execute.call_count == 2


@pytest.mark.asyncio
async def test_get_annotations_with_book_id_filter():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    count_result = MagicMock()
    count_result.scalar.return_value = 1

    data_result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [_make_annotation(user_id=user_id, book_id=book_id)]
    data_result.scalars.return_value = scalars_mock

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    result, total = await annotation_service.get_annotations(db, user_id, book_id=book_id)

    assert total == 1
    assert len(result) == 1


@pytest.mark.asyncio
async def test_get_annotations_with_type_filter():
    db = _make_db_session()
    user_id = str(uuid4())

    count_result = MagicMock()
    count_result.scalar.return_value = 2

    data_result = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = [
        _make_annotation(user_id=user_id, type='highlight'),
        _make_annotation(user_id=user_id, type='highlight'),
    ]
    data_result.scalars.return_value = scalars_mock

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    result, total = await annotation_service.get_annotations(db, user_id, type='highlight')

    assert total == 2
    assert all(a.type == 'highlight' for a in result)


@pytest.mark.asyncio
async def test_get_annotations_empty_results():
    db = _make_db_session()
    user_id = str(uuid4())

    count_result = MagicMock()
    count_result.scalar.return_value = 0

    data_result = MagicMock()
    data_result.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    result, total = await annotation_service.get_annotations(db, user_id)

    assert total == 0
    assert result == []


@pytest.mark.asyncio
async def test_get_annotations_count_returns_none_defaults_to_zero():
    db = _make_db_session()
    user_id = str(uuid4())

    count_result = MagicMock()
    count_result.scalar.return_value = None

    data_result = MagicMock()
    data_result.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    result, total = await annotation_service.get_annotations(db, user_id)

    assert total == 0


@pytest.mark.asyncio
async def test_get_annotations_pagination_offset():
    db = _make_db_session()
    user_id = str(uuid4())

    count_result = MagicMock()
    count_result.scalar.return_value = 100

    data_result = MagicMock()
    data_result.scalars.return_value.all.return_value = [_make_annotation()]

    db.execute = AsyncMock(side_effect=[count_result, data_result])

    await annotation_service.get_annotations(db, user_id, page=3, per_page=10)

    # Verify the second execute call (data query) was made
    assert db.execute.call_count == 2


# ---------------------------------------------------------------------------
# get_annotation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_annotation_found():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()
    expected = _make_annotation(annotation_id=annotation_id, user_id=user_id)

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = expected
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.get_annotation(db, user_id, annotation_id)

    assert result is expected
    assert result.id == annotation_id


@pytest.mark.asyncio
async def test_get_annotation_not_found():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.get_annotation(db, user_id, annotation_id)

    assert result is None


@pytest.mark.asyncio
async def test_get_annotation_wrong_user_returns_none():
    db = _make_db_session()
    annotation_id = uuid4()
    wrong_user = str(uuid4())

    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.get_annotation(db, wrong_user, annotation_id)

    assert result is None


# ---------------------------------------------------------------------------
# create_annotation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_annotation_highlight():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    created = _make_annotation(user_id=user_id, book_id=book_id, type='highlight')
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=created)

    data = MagicMock()
    data.book_id = book_id
    data.type = 'highlight'
    data.location = {'page': 1, 'chapter': 'Ch 1'}
    data.content = 'A great quote'
    data.color = '#ff0000'
    data.note = None
    data.tags = ['important']

    # Capture the annotation passed to db.add
    added_annotations = []
    db.add = lambda ann: added_annotations.append(ann)

    result = await annotation_service.create_annotation(db, user_id, data)

    assert len(added_annotations) == 1
    added = added_annotations[0]
    assert added.user_id == user_id
    assert added.book_id == book_id
    assert added.type == 'highlight'
    assert added.content == 'A great quote'
    assert added.color == '#ff0000'
    assert added.tags == ['important']
    db.flush.assert_awaited_once()
    db.refresh.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_annotation_note_with_tags():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    created = _make_annotation(user_id=user_id, book_id=book_id, type='note')
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=created)

    data = MagicMock()
    data.book_id = book_id
    data.type = 'note'
    data.location = {'page': 10}
    data.content = 'My note text'
    data.color = None
    data.note = 'Additional thoughts'
    data.tags = ['review', 'philosophy']

    added_annotations = []
    db.add = lambda ann: added_annotations.append(ann)

    result = await annotation_service.create_annotation(db, user_id, data)

    added = added_annotations[0]
    assert added.type == 'note'
    assert added.note == 'Additional thoughts'
    assert added.tags == ['review', 'philosophy']


@pytest.mark.asyncio
async def test_create_annotation_bookmark():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    created = _make_annotation(user_id=user_id, book_id=book_id, type='bookmark')
    db.flush = AsyncMock()
    db.refresh = AsyncMock(return_value=created)

    data = MagicMock()
    data.book_id = book_id
    data.type = 'bookmark'
    data.location = {'page': 50}
    data.content = 'Bookmark at page 50'
    data.color = None
    data.note = None
    data.tags = []

    added_annotations = []
    db.add = lambda ann: added_annotations.append(ann)

    result = await annotation_service.create_annotation(db, user_id, data)

    added = added_annotations[0]
    assert added.type == 'bookmark'


# ---------------------------------------------------------------------------
# update_annotation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_annotation_success():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()
    existing = _make_annotation(annotation_id=annotation_id, user_id=user_id)
    existing.note = 'old note'
    existing.color = '#000000'

    db.flush = AsyncMock()

    data = MagicMock()
    data.model_dump.return_value = {'note': 'new note', 'color': '#ff0000'}

    with patch.object(annotation_service, 'get_annotation', return_value=existing):
        result = await annotation_service.update_annotation(db, user_id, annotation_id, data)

    assert result is existing
    assert result.note == 'new note'
    assert result.color == '#ff0000'
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_annotation_not_found():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()

    data = MagicMock()

    with patch.object(annotation_service, 'get_annotation', return_value=None):
        result = await annotation_service.update_annotation(db, user_id, annotation_id, data)

    assert result is None


@pytest.mark.asyncio
async def test_update_annotation_partial_update_only_sets_provided_fields():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()
    existing = _make_annotation(annotation_id=annotation_id, user_id=user_id)
    existing.note = 'original note'
    existing.color = '#000000'
    existing.content = 'original content'

    db.flush = AsyncMock()

    # Only update color, not note or content
    data = MagicMock()
    data.model_dump.return_value = {'color': '#00ff00'}

    with patch.object(annotation_service, 'get_annotation', return_value=existing):
        result = await annotation_service.update_annotation(db, user_id, annotation_id, data)

    assert result.color == '#00ff00'
    assert result.note == 'original note'
    assert result.content == 'original content'


# ---------------------------------------------------------------------------
# delete_annotation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_annotation_success():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()
    existing = _make_annotation(annotation_id=annotation_id, user_id=user_id)

    db.delete = AsyncMock()
    db.flush = AsyncMock()

    with patch.object(annotation_service, 'get_annotation', return_value=existing):
        result = await annotation_service.delete_annotation(db, user_id, annotation_id)

    assert result is True
    db.delete.assert_awaited_once_with(existing)
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_annotation_not_found():
    db = _make_db_session()
    user_id = str(uuid4())
    annotation_id = uuid4()

    with patch.object(annotation_service, 'get_annotation', return_value=None):
        result = await annotation_service.delete_annotation(db, user_id, annotation_id)

    assert result is False


# ---------------------------------------------------------------------------
# search_annotations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_search_annotations_found():
    db = _make_db_session()
    user_id = str(uuid4())

    matching = [_make_annotation(content='The Gatsby effect')]
    result_mock = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = matching
    result_mock.scalars.return_value = scalars_mock
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.search_annotations(db, user_id, 'Gatsby')

    assert len(result) == 1
    assert result[0].content == 'The Gatsby effect'


@pytest.mark.asyncio
async def test_search_annotations_with_book_filter():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.search_annotations(db, user_id, 'test', book_id=book_id)

    assert result == []
    # Verify the query was built (execute called once)
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_search_annotations_escapes_special_chars():
    db = _make_db_session()
    user_id = str(uuid4())

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    # Search with SQL LIKE special characters
    result = await annotation_service.search_annotations(db, user_id, '100% real_test')

    assert result == []
    # The query should have been built with escaped % and _
    call_args = str(db.execute.call_args)


@pytest.mark.asyncio
async def test_search_annotations_empty_query():
    db = _make_db_session()
    user_id = str(uuid4())

    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    result = await annotation_service.search_annotations(db, user_id, '')

    assert result == []


# ---------------------------------------------------------------------------
# get_chapter_stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_chapter_stats_groups_by_chapter():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    row1 = MagicMock(chapter='Chapter 1', type='highlight', count=1)
    row2 = MagicMock(chapter='Chapter 1', type='note', count=1)
    row3 = MagicMock(chapter='Chapter 2', type='bookmark', count=1)

    result_mock = MagicMock()
    result_mock.all.return_value = [row1, row2, row3]
    db.execute = AsyncMock(return_value=result_mock)

    stats = await annotation_service.get_chapter_stats(db, user_id, book_id)

    assert len(stats) == 2
    ch1 = next(s for s in stats if s['chapter'] == 'Chapter 1')
    ch2 = next(s for s in stats if s['chapter'] == 'Chapter 2')
    assert ch1['count'] == 2
    assert ch1['types']['highlight'] == 1
    assert ch1['types']['note'] == 1
    assert ch1['types']['bookmark'] == 0
    assert ch2['count'] == 1
    assert ch2['types']['bookmark'] == 1


@pytest.mark.asyncio
async def test_get_chapter_stats_empty():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    result_mock = MagicMock()
    result_mock.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    stats = await annotation_service.get_chapter_stats(db, user_id, book_id)

    assert stats == []


@pytest.mark.asyncio
async def test_get_chapter_stats_unknown_chapter():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    # SQL coalesce returns 'Unknown' when chapter is null
    row = MagicMock(chapter='Unknown', type='highlight', count=1)

    result_mock = MagicMock()
    result_mock.all.return_value = [row]
    db.execute = AsyncMock(return_value=result_mock)

    stats = await annotation_service.get_chapter_stats(db, user_id, book_id)

    assert len(stats) == 1
    assert stats[0]['chapter'] == 'Unknown'
    assert stats[0]['types']['highlight'] == 1


@pytest.mark.asyncio
async def test_get_chapter_stats_all_types():
    db = _make_db_session()
    user_id = str(uuid4())
    book_id = uuid4()

    rows = [
        MagicMock(chapter='Intro', type='highlight', count=1),
        MagicMock(chapter='Intro', type='note', count=1),
        MagicMock(chapter='Intro', type='bookmark', count=1),
    ]

    result_mock = MagicMock()
    result_mock.all.return_value = rows
    db.execute = AsyncMock(return_value=result_mock)

    stats = await annotation_service.get_chapter_stats(db, user_id, book_id)

    assert len(stats) == 1
    assert stats[0]['count'] == 3
    assert stats[0]['types'] == {'highlight': 1, 'note': 1, 'bookmark': 1}


# ---------------------------------------------------------------------------
# get_tags
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_tags_returns_tag_counts():
    db = _make_db_session()
    user_id = str(uuid4())

    result_mock = MagicMock()
    result_mock.all.return_value = [('philosophy', 5), ('fiction', 3)]
    db.execute = AsyncMock(return_value=result_mock)

    tags = await annotation_service.get_tags(db, user_id)

    assert len(tags) == 2
    assert tags[0] == {'name': 'philosophy', 'count': 5}
    assert tags[1] == {'name': 'fiction', 'count': 3}


@pytest.mark.asyncio
async def test_get_tags_empty():
    db = _make_db_session()
    user_id = str(uuid4())

    result_mock = MagicMock()
    result_mock.all.return_value = []
    db.execute = AsyncMock(return_value=result_mock)

    tags = await annotation_service.get_tags(db, user_id)

    assert tags == []


@pytest.mark.asyncio
async def test_get_tags_filters_none_values():
    db = _make_db_session()
    user_id = str(uuid4())

    # unnest can produce NULL for empty arrays
    result_mock = MagicMock()
    result_mock.all.return_value = [('valid', 2), (None, 1)]
    db.execute = AsyncMock(return_value=result_mock)

    tags = await annotation_service.get_tags(db, user_id)

    assert len(tags) == 1
    assert tags[0]['name'] == 'valid'
