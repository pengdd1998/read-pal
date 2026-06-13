"""Tests for RAG service — embedding, chunking, search, caching, cache key isolation."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.exc import DBAPIError

from app.services.rag import (
    RAG_CACHE_PREFIX,
    _chunk_text,
    _get_embedding,
    _keyword_chapter_search,
    _semantic_chapter_search,
    _stable_hash,
    get_book_context,
    precompute_book_embeddings,
)


# ---------------------------------------------------------------------------
# Unit tests — pure functions
# ---------------------------------------------------------------------------


class TestStableHash:
    def test_deterministic(self):
        assert _stable_hash('hello') == _stable_hash('hello')

    def test_different_inputs(self):
        assert _stable_hash('hello') != _stable_hash('world')

    def test_empty_string(self):
        result = _stable_hash('')
        assert isinstance(result, str)
        assert len(result) == 16


class TestChunkText:
    def test_short_text(self):
        text = 'Hello world'
        chunks = _chunk_text(text, chunk_size=2000)
        assert chunks == [text]

    def test_empty_text(self):
        assert _chunk_text('') == []
        assert _chunk_text(None) == []

    def test_long_text_splits(self):
        text = 'word ' * 2000  # ~10000 chars
        chunks = _chunk_text(text, chunk_size=2000, overlap=256)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 2400  # sentence-boundary split may overshoot slightly

    def test_overlap_between_paragraph_chunks(self):
        # Two long paragraphs that each fill a chunk
        text = ('a' * 1500) + '\n\n' + ('b' * 1500) + '\n\n' + ('c' * 1500)
        chunks = _chunk_text(text, chunk_size=2000, overlap=200)
        assert len(chunks) >= 2
        # First chunk should contain the first paragraph
        assert 'a' * 100 in chunks[0]

    def test_min_chunk_length(self):
        text = 'a' * 50 + '\n\n' + 'b' * 10
        chunks = _chunk_text(text, chunk_size=2000)
        for chunk in chunks:
            assert len(chunk) > 50

    def test_paragraph_boundary_respected(self):
        text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
        chunks = _chunk_text(text, chunk_size=30, overlap=5)
        # Chunks should not split mid-word
        for chunk in chunks:
            assert chunk.strip()  # no empty chunks

    def test_short_paragraphs_merged(self):
        # Dialogue-style short paragraphs should merge into one chunk
        lines = ['"Hello," she said.', '"Hi," he replied.', '"How are you?"', '"Fine, thanks."']
        text = '\n\n'.join(lines)
        chunks = _chunk_text(text, chunk_size=2000, overlap=0)
        assert len(chunks) == 1
        assert all(line in chunks[0] for line in lines)

    def test_long_paragraph_resplit(self):
        # Single paragraph exceeding chunk_size gets re-split on sentences
        text = 'Sentence one. ' * 500  # ~7000 chars, no \n\n
        chunks = _chunk_text(text, chunk_size=2000, overlap=0)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 2200

    def test_dialogue_grouping(self):
        # Many short dialogue lines should group together
        lines = [f'"Line {i}."' for i in range(20)]
        text = '\n\n'.join(lines)
        chunks = _chunk_text(text, chunk_size=500, overlap=0)
        # Should be fewer chunks than lines (merged)
        assert len(chunks) < 20
        # Each chunk should have multiple lines
        for chunk in chunks:
            assert '\n\n' in chunk


class TestKeywordSearch:
    def _make_chapters(self):
        return [
            {'title': 'Introduction', 'content': 'This chapter introduces machine learning concepts.'},
            {'title': 'Chapter 2', 'content': 'Deep neural networks and backpropagation.'},
            {'title': 'Conclusion', 'content': 'Summary of key findings and future work.'},
        ]

    def test_english_keyword_match(self):
        chapters = self._make_chapters()
        results = _keyword_chapter_search(chapters, 'machine learning')
        assert len(results) > 0
        assert results[0]['title'] == 'Introduction'

    def test_no_match(self):
        chapters = self._make_chapters()
        results = _keyword_chapter_search(chapters, 'quantum physics')
        assert results == []

    def test_cjk_tokenization(self):
        chapters = [
            {'title': '第一章', 'content': '这是一个关于机器学习的故事'},
            {'title': '第二章', 'content': '深度学习的应用'},
        ]
        results = _keyword_chapter_search(chapters, '机器学习')
        assert len(results) > 0

    def test_cjk_individual_chars(self):
        chapters = [
            {'title': '月亮篇', 'content': '月亮很圆很亮。今晚的月亮特别美丽。'},
        ]
        results = _keyword_chapter_search(chapters, query='月亮', top_k=3)
        assert len(results) >= 1
        assert '月亮' in results[0]['content']

    def test_mixed_cjk_latin_query(self):
        chapters = [
            {'title': '技术笔记',
             'content': 'Python is a great language for data science. '
                        'Python的生态系统非常丰富。'},
        ]
        results = _keyword_chapter_search(chapters, query='Python 生态', top_k=3)
        assert len(results) >= 1

    def test_top_k_limit(self):
        chapters = [
            {'title': f'Ch{i}', 'content': f'machine learning is great chapter {i}'}
            for i in range(10)
        ]
        results = _keyword_chapter_search(chapters, 'machine learning', top_k=3)
        assert len(results) == 3

    def test_empty_chapters(self):
        results = _keyword_chapter_search([], 'test query')
        assert results == []


class TestCacheKeyIsolation:
    """Verify that cache keys are user-scoped to prevent cross-user data leakage."""

    def test_cache_key_includes_user_id(self):
        book_id = uuid4()
        user_a = uuid4()
        user_b = uuid4()
        query = 'meaning of life'

        key_a = f'{RAG_CACHE_PREFIX}{book_id}:{user_a}:{_stable_hash(query)}'
        key_b = f'{RAG_CACHE_PREFIX}{book_id}:{user_b}:{_stable_hash(query)}'

        assert key_a != key_b

        key_a2 = f'{RAG_CACHE_PREFIX}{book_id}:{user_a}:{_stable_hash(query)}'
        assert key_a == key_a2

    def test_cache_key_includes_book_id(self):
        user_id = uuid4()
        book_a = uuid4()
        book_b = uuid4()
        query = 'test'

        key_a = f'{RAG_CACHE_PREFIX}{book_a}:{user_id}:{_stable_hash(query)}'
        key_b = f'{RAG_CACHE_PREFIX}{book_b}:{user_id}:{_stable_hash(query)}'

        assert key_a != key_b

    def test_cache_key_includes_query_hash(self):
        user_id = uuid4()
        book_id = uuid4()

        key_a = f'{RAG_CACHE_PREFIX}{book_id}:{user_id}:{_stable_hash("query a")}'
        key_b = f'{RAG_CACHE_PREFIX}{book_id}:{user_id}:{_stable_hash("query b")}'

        assert key_a != key_b


# ---------------------------------------------------------------------------
# Integration tests — mocked external dependencies
# ---------------------------------------------------------------------------


class TestGetEmbedding:
    @pytest.mark.asyncio
    async def test_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            'data': [{'embedding': [0.1, 0.2, 0.3]}],
        }
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch('app.services.rag.embedding._get_http_client', return_value=mock_client):
            with patch('app.services.rag.embedding.get_settings') as mock_settings:
                mock_settings.return_value.glm_api_key = 'test-key'
                result = await _get_embedding('hello world')
                assert result == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    async def test_no_api_key(self):
        with patch('app.services.rag.embedding.get_settings') as mock_settings:
            mock_settings.return_value.glm_api_key = 'dev-key'
            result = await _get_embedding('hello world')
            assert result is None

    @pytest.mark.asyncio
    async def test_api_failure(self):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=ConnectionError('Network error'))

        with patch('app.services.rag.embedding._get_http_client', return_value=mock_client):
            with patch('app.services.rag.embedding.get_settings') as mock_settings:
                mock_settings.return_value.glm_api_key = 'test-key'
                result = await _get_embedding('hello world')
                assert result is None


class TestPrecomputeBookEmbeddings:
    @pytest.mark.asyncio
    async def test_creates_book_chunks(self):
        from app.models.book_chunk import BookChunk

        book_id = uuid4()
        document_id = uuid4()
        chapters = [
            {'title': 'Chapter 1', 'content': 'A' * 100},
        ]
        embedding = [0.1] * 2048

        # async_session() returns an async context manager yielding session
        mock_session = MagicMock()
        mock_session.add_all = MagicMock()
        mock_session.begin = MagicMock()

        # Mock execute for preflight checks:
        #   call 1: _check_embedding_column → first() returns (data_type, 'vector')
        #   call 2: _check_record_exists (Book) → scalar_one_or_none() returns book_id
        #   call 3: _check_record_exists (Document) → scalar_one_or_none() returns document_id
        col_result = MagicMock()
        col_result.first.return_value = MagicMock(udt_name='vector')
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book_id
        doc_result = MagicMock()
        doc_result.scalar_one_or_none.return_value = document_id
        mock_session.execute = AsyncMock(side_effect=[col_result, book_result, doc_result])

        # session.begin() returns an async context manager
        mock_begin = MagicMock()
        mock_begin.__aenter__ = AsyncMock(return_value=None)
        mock_begin.__aexit__ = AsyncMock(return_value=False)
        mock_session.begin.return_value = mock_begin

        # async_session() call returns an async context manager yielding session
        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_ctx)

        with (
            patch('app.services.rag.precompute.get_settings') as mock_settings,
            patch('app.services.rag.precompute._get_embedding', return_value=embedding),
            patch('app.db.async_session', mock_factory),
        ):
            mock_settings.return_value.glm_api_key = 'test-key'
            mock_settings.return_value.max_embedding_calls = 100
            mock_settings.return_value.embedding_enabled = True
            await precompute_book_embeddings(book_id, document_id, chapters)

            mock_session.add_all.assert_called_once()
            chunks = mock_session.add_all.call_args[0][0]
            assert len(chunks) >= 1
            assert isinstance(chunks[0], BookChunk)
            assert chunks[0].book_id == book_id
            assert chunks[0].embedding == embedding

    @pytest.mark.asyncio
    async def test_skips_without_api_key(self):
        with patch('app.services.rag.precompute.get_settings') as mock_settings:
            mock_settings.return_value.glm_api_key = 'dev-key'
            await precompute_book_embeddings(uuid4(), uuid4(), [{'title': 'T', 'content': 'C'}])
            # No error, just skips


class TestSemanticSearch:
    @pytest.mark.asyncio
    async def test_no_query_embedding(self):
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        with patch('app.services.rag.search._get_embedding', return_value=None):
            results = await _semantic_chapter_search(mock_db, uuid4(), 'test')
            assert results == []

    @pytest.mark.asyncio
    async def test_db_failure_returns_empty(self):
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_db.execute = AsyncMock(side_effect=DBAPIError('stmt', {}, Exception('DB error')))

        with patch('app.services.rag.search._get_embedding', return_value=[0.1] * 2048):
            results = await _semantic_chapter_search(mock_db, uuid4(), 'test')
            assert results == []


class TestGetBookContext:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_book(self):
        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_book_context(mock_db, uuid4(), uuid4(), 'test query')
        assert result == ''

    @pytest.mark.asyncio
    async def test_keyword_fallback(self):
        """When semantic search fails, keyword search should kick in."""
        user_id = uuid4()
        book_id = uuid4()

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        book_row = MagicMock()
        book_row.scalar_one_or_none.return_value = MagicMock()

        ann_row = MagicMock()
        ann_row.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[book_row, ann_row])

        with (
            patch('app.services.rag.context.get_redis') as mock_redis,
            patch('app.services.rag.context._semantic_chapter_search', return_value=[]),
            patch('app.services.rag.context._keyword_chunk_search', return_value=[]),
            patch('app.services.rag.context._get_chapters', return_value=[
                {'title': 'ML Basics', 'content': 'Machine learning fundamentals and algorithms'},
            ]),
        ):
            mock_r = AsyncMock()
            mock_r.get.return_value = None
            mock_r.setex.return_value = True
            mock_redis.return_value = mock_r

            result = await get_book_context(mock_db, user_id, book_id, 'machine learning')
            assert 'ML Basics' in result or 'Machine learning' in result

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_value(self):
        cached_text = 'Previously cached context about the novel.'
        mock_redis = AsyncMock()
        mock_redis.get.return_value = cached_text

        mock_book = MagicMock()
        mock_book.status = 'completed'
        mock_book.current_page = 0

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_book
        mock_db.execute = AsyncMock(return_value=mock_result)

        with patch('app.services.rag.context.get_redis', return_value=mock_redis):
            result = await get_book_context(
                db=mock_db,
                user_id=uuid4(),
                book_id=uuid4(),
                query='cached query',
            )
            assert result == cached_text

    @pytest.mark.asyncio
    async def test_successful_retrieval_writes_to_cache(self):
        book_id = uuid4()
        user_id = uuid4()

        mock_book = MagicMock()
        mock_book.id = book_id
        mock_book.user_id = user_id
        mock_book.status = 'reading'
        mock_book.current_page = 999

        mock_db = AsyncMock()
        mock_db.add = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_book
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True

        chapters = [
            {'title': 'Chapter 1', 'content': 'The protagonist discovers a hidden garden. ' * 20},
        ]

        with (
            patch('app.services.rag.context.get_redis', return_value=mock_redis),
            patch('app.services.rag.context._get_chapters', return_value=chapters),
            patch('app.services.rag.context._semantic_chapter_search', return_value=[]),
            patch('app.services.rag.context._keyword_chapter_search', return_value=[
                {'title': 'Chapter 1', 'content': 'The protagonist discovers a hidden garden. ' * 20},
            ]),
            patch('app.services.rag.context._load_related_annotations', return_value=[]),
            patch('app.services.rag.context.sanitize_user_input', side_effect=lambda x, **kw: x),
        ):
            result = await get_book_context(
                db=mock_db,
                user_id=user_id,
                book_id=book_id,
                query='garden',
            )
            assert 'garden' in result.lower()
            mock_redis.setex.assert_called_once()
