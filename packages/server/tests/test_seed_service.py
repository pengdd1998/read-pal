"""Unit tests for seed_service — sample data seeding for new users.

Tests the two public functions:
- seed_sample_data(): Creates Gatsby book + annotations + session + graph cache
- _seed_graph_cache(): Pre-populates Redis with knowledge graph data
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
import redis.exceptions

from app.models.annotation import AnnotationType
from app.models.book import BookFileType, BookStatus
from app.services.seed_service import (
    GATSBY_CHAPTERS,
    GATSBY_CONCEPTS,
    seed_sample_data,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_db() -> AsyncMock:
    """Create a mock AsyncSession that tracks added objects."""
    db = AsyncMock()
    added_objects: list = []
    added_all_objects: list = []

    def track_add(obj):
        added_objects.append(obj)

    def track_add_all(objs):
        added_all_objects.append(objs)

    # Use synchronous side_effects for add/add_all, async for flush/refresh
    db.add = MagicMock(side_effect=track_add)
    db.add_all = MagicMock(side_effect=track_add_all)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db._added = added_objects
    db._added_all = added_all_objects
    return db


# ---------------------------------------------------------------------------
# Tests for seed_sample_data
# ---------------------------------------------------------------------------


class TestSeedSampleData:
    """Tests for the seed_sample_data public function."""

    @pytest.mark.asyncio
    async def test_creates_book_with_correct_metadata(self):
        """The seeded book should have Gatsby title, author, and reading status."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        assert book.title == 'The Great Gatsby'
        assert book.author == 'F. Scott Fitzgerald'
        assert book.file_type == BookFileType.epub
        assert book.status == BookStatus.reading
        assert book.user_id == user_id

    @pytest.mark.asyncio
    async def test_book_has_expected_tags_and_metadata(self):
        """Book tags and metadata_ dict should contain sample values."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        assert 'sample' in book.tags
        assert 'classic' in book.tags
        assert 'fiction' in book.tags
        assert book.metadata_['year'] == 1925
        assert book.metadata_['genre'] == 'Fiction'

    @pytest.mark.asyncio
    async def test_book_page_count_matches_chapters(self):
        """total_pages should equal the number of GATSBY_CHAPTERS."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        assert book.total_pages == len(GATSBY_CHAPTERS)

    @pytest.mark.asyncio
    async def test_creates_document_with_chapter_content(self):
        """A Document with all chapter content should be added."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        # Document should be the second add() call (book is first)
        doc = db._added[1]
        expected_content = '\n'.join(ch['content'] for ch in GATSBY_CHAPTERS)
        assert doc.content == expected_content
        assert doc.chapters == GATSBY_CHAPTERS
        assert doc.book_id == book.id

    @pytest.mark.asyncio
    async def test_creates_annotations_with_variety(self):
        """Should create highlights, notes, and bookmarks."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            await seed_sample_data(db, user_id)

        annotations = db._added_all[0]
        types = {a.type for a in annotations}
        assert AnnotationType.highlight in types
        assert AnnotationType.note in types
        assert AnnotationType.bookmark in types

    @pytest.mark.asyncio
    async def test_annotations_have_required_fields(self):
        """All annotations must have user_id, book_id, content, location."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        annotations = db._added_all[0]
        for ann in annotations:
            assert ann.user_id == user_id
            assert ann.book_id == book.id
            assert ann.content
            assert isinstance(ann.location, dict)
            assert 'pageIndex' in ann.location

    @pytest.mark.asyncio
    async def test_creates_reading_session(self):
        """Should create a completed reading session for dashboard stats."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            book = await seed_sample_data(db, user_id)

        # ReadingSession is the 3rd add() call: book(0), doc(1), session(2)
        session = db._added[2]
        assert session.user_id == user_id
        assert session.book_id == book.id
        assert session.is_active is False
        assert session.duration == 900
        assert session.pages_read == 1
        assert session.highlights == 5
        assert session.notes == 2
        assert session.ended_at is not None

    @pytest.mark.asyncio
    async def test_calls_graph_cache_seeding(self):
        """_seed_graph_cache should be called with the user and book IDs."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock) as mock_graph:
            book = await seed_sample_data(db, user_id)

        mock_graph.assert_awaited_once_with(user_id, book.id)

    @pytest.mark.asyncio
    async def test_db_flush_and_refresh_called(self):
        """Should flush and refresh to get the book ID for related records."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            await seed_sample_data(db, user_id)

        db.flush.assert_awaited_once()
        db.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_book_object(self):
        """Return value should be the Book instance (with ID after refresh)."""
        db = _make_mock_db()
        user_id = uuid4()

        with patch('app.services.seed_service._seed_graph_cache', new_callable=AsyncMock):
            result = await seed_sample_data(db, user_id)

        assert result.title == 'The Great Gatsby'


# ---------------------------------------------------------------------------
# Tests for _seed_graph_cache (internal)
# ---------------------------------------------------------------------------


class TestSeedGraphCache:
    """Tests for the _seed_graph_cache internal function."""

    @pytest.mark.asyncio
    async def test_writes_graph_to_redis(self):
        """Should set a Redis key with serialized graph data."""
        from app.services.seed_service import _seed_graph_cache

        user_id = uuid4()
        book_id = uuid4()
        mock_redis = AsyncMock()

        with (
            patch('app.core.redis.get_redis', return_value=mock_redis),
            patch('app.services.knowledge_service._knowledge_cache_ttl', return_value=3600),
            patch('app.services.knowledge_service.GRAPH_KEY_PREFIX', 'kg:'),
        ):
            await _seed_graph_cache(user_id, book_id)

        mock_redis.setex.assert_awaited_once()
        call_args = mock_redis.setex.call_args
        cache_key = call_args[0][0]
        ttl = call_args[0][1]
        data = json.loads(call_args[0][2])

        assert cache_key == f'kg:{user_id}:{book_id}:graph'
        assert ttl == 3600
        assert 'nodes' in data
        assert 'edges' in data

    @pytest.mark.asyncio
    async def test_graph_data_has_correct_structure(self):
        """Nodes should have id/label/type/size, edges should have source/target/label/weight."""
        from app.services.seed_service import _seed_graph_cache

        user_id = uuid4()
        book_id = uuid4()
        mock_redis = AsyncMock()

        with (
            patch('app.core.redis.get_redis', return_value=mock_redis),
            patch('app.services.knowledge_service._knowledge_cache_ttl', return_value=3600),
            patch('app.services.knowledge_service.GRAPH_KEY_PREFIX', 'kg:'),
        ):
            await _seed_graph_cache(user_id, book_id)

        data = json.loads(mock_redis.setex.call_args[0][2])

        # Verify nodes
        assert len(data['nodes']) == len(GATSBY_CONCEPTS)
        for node in data['nodes']:
            assert 'id' in node
            assert 'label' in node
            assert 'type' in node
            assert 'size' in node
            assert node['metadata']['bookId'] == str(book_id)

        # Verify edges (no duplicates)
        edge_pairs = set()
        for edge in data['edges']:
            assert 'source' in edge
            assert 'target' in edge
            assert 'label' in edge
            assert 'weight' in edge
            pair = tuple(sorted([edge['source'], edge['target']]))
            assert pair not in edge_pairs, f'Duplicate edge: {pair}'
            edge_pairs.add(pair)

    @pytest.mark.asyncio
    async def test_handles_redis_failure_gracefully(self):
        """Should not raise if Redis is unavailable."""
        from app.services.seed_service import _seed_graph_cache

        user_id = uuid4()
        book_id = uuid4()

        with patch('app.core.redis.get_redis', side_effect=redis.exceptions.RedisError('Redis down')):
            # Should not raise — function catches all exceptions
            await _seed_graph_cache(user_id, book_id)


# ---------------------------------------------------------------------------
# Tests for GATSBY_CHAPTERS and GATSBY_CONCEPTS data integrity
# ---------------------------------------------------------------------------


class TestDataIntegrity:
    """Verify the static seed data is well-formed."""

    def test_chapters_have_required_keys(self):
        for ch in GATSBY_CHAPTERS:
            assert 'id' in ch
            assert 'title' in ch
            assert 'content' in ch
            assert ch['content'].startswith('<p>')

    def test_concepts_have_required_keys(self):
        for concept in GATSBY_CONCEPTS:
            assert 'name' in concept
            assert 'type' in concept
            assert 'related' in concept
            assert isinstance(concept['related'], list)

    def test_all_concept_names_are_unique(self):
        names = [c['name'] for c in GATSBY_CONCEPTS]
        assert len(names) == len(set(names))

    def test_chapter_ids_are_unique(self):
        ids = [ch['id'] for ch in GATSBY_CHAPTERS]
        assert len(ids) == len(set(ids))
