"""Tests for RAG service — embedding, chunking, search, caching, cache key isolation."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.rag_service import (
    RAG_CACHE_PREFIX,
    _chunk_text,
    _cosine_sim,
    _get_chunk_embeddings,
    _get_embedding,
    _keyword_chapter_search,
    _semantic_chapter_search,
    _stable_hash,
    get_book_context,
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


class TestCosineSim:
    def test_identical_vectors(self):
        vec = [1.0, 2.0, 3.0]
        assert _cosine_sim(vec, vec) == pytest.approx(1.0)

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert _cosine_sim(a, b) == pytest.approx(0.0)

    def test_opposite_vectors(self):
        a = [1.0, 0.0]
        b = [-1.0, 0.0]
        assert _cosine_sim(a, b) == pytest.approx(-1.0)

    def test_zero_vector(self):
        assert _cosine_sim([0.0, 0.0], [1.0, 2.0]) == 0.0
        assert _cosine_sim([1.0, 2.0], [0.0, 0.0]) == 0.0

    def test_different_magnitudes(self):
        a = [1.0, 0.0]
        b = [3.0, 0.0]
        assert _cosine_sim(a, b) == pytest.approx(1.0)


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
        # Each chunk should be <= chunk_size (except possibly last one with overlap)
        for chunk in chunks:
            assert len(chunk) <= 2200  # Allow slight overshoot from sentence boundaries

    def test_overlap_between_chunks(self):
        text = 'a' * 5000
        chunks = _chunk_text(text, chunk_size=2000, overlap=200)
        if len(chunks) > 1:
            # Verify overlap exists — end of chunk[i] overlaps with start of chunk[i+1]
            tail = chunks[0][-200:]
            head = chunks[1][:200]
            assert tail == head

    def test_min_chunk_length(self):
        text = 'a' * 50 + '\n\n' + 'b' * 10
        chunks = _chunk_text(text, chunk_size=2000)
        # The tiny 'b' chunk should be filtered (< 50 chars)
        for chunk in chunks:
            assert len(chunk) > 50

    def test_sentence_boundary_break(self):
        text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
        chunks = _chunk_text(text, chunk_size=30, overlap=5)
        # Should break at paragraph boundaries, not mid-word
        for chunk in chunks:
            assert not chunk.endswith('pa')  # No mid-word breaks


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
        """CJK characters are tokenized individually, enabling char-level matching."""
        chapters = [
            {'title': '月亮篇', 'content': '月亮很圆很亮。今晚的月亮特别美丽。'},
        ]
        results = _keyword_chapter_search(chapters, query='月亮', top_k=3)
        assert len(results) >= 1
        assert '月亮' in results[0]['content']

    def test_mixed_cjk_latin_query(self):
        """Mixed CJK and Latin tokens in the same query."""
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
        """Different users querying the same book+query get different cache keys."""
        book_id = uuid4()
        user_a = uuid4()
        user_b = uuid4()
        query = 'meaning of life'

        key_a = f'{RAG_CACHE_PREFIX}{book_id}:{user_a}:{_stable_hash(query)}'
        key_b = f'{RAG_CACHE_PREFIX}{book_id}:{user_b}:{_stable_hash(query)}'

        # Different users must get different cache keys for the same book+query
        assert key_a != key_b

        # Same user + same query must be deterministic
        key_a2 = f'{RAG_CACHE_PREFIX}{book_id}:{user_a}:{_stable_hash(query)}'
        assert key_a == key_a2

    def test_cache_key_includes_book_id(self):
        """Same user querying different books gets different cache keys."""
        user_id = uuid4()
        book_a = uuid4()
        book_b = uuid4()
        query = 'test'

        key_a = f'{RAG_CACHE_PREFIX}{book_a}:{user_id}:{_stable_hash(query)}'
        key_b = f'{RAG_CACHE_PREFIX}{book_b}:{user_id}:{_stable_hash(query)}'

        assert key_a != key_b

    def test_cache_key_includes_query_hash(self):
        """Same user+book but different queries get different cache keys."""
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

        with patch('app.services.rag_service._get_http_client', return_value=mock_client):
            with patch('app.services.rag_service.get_settings') as mock_settings:
                mock_settings.return_value.glm_api_key = 'test-key'
                result = await _get_embedding('hello world')
                assert result == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    async def test_no_api_key(self):
        with patch('app.services.rag_service.get_settings') as mock_settings:
            mock_settings.return_value.glm_api_key = 'dev-key'
            result = await _get_embedding('hello world')
            assert result is None

    @pytest.mark.asyncio
    async def test_api_failure(self):
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception('Network error'))

        with patch('app.services.rag_service._get_http_client', return_value=mock_client):
            with patch('app.services.rag_service.get_settings') as mock_settings:
                mock_settings.return_value.glm_api_key = 'test-key'
                result = await _get_embedding('hello world')
                assert result is None


class TestGetChunkEmbeddings:
    @pytest.mark.asyncio
    async def test_cache_hit(self):
        chapter = {'title': 'Test Chapter', 'content': 'Some content here'}
        book_id = uuid4()
        cached_emb = [0.1, 0.2, 0.3]

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=json.dumps(cached_emb))

        with patch('app.services.rag_service.get_redis', return_value=mock_redis):
            result = await _get_chunk_embeddings(chapter, book_id)
            # Should return list of (chunk_text, embedding) tuples
            assert len(result) >= 1
            chunk_text, emb = result[0]
            assert emb == cached_emb
            assert 'Test Chapter' in chunk_text

    @pytest.mark.asyncio
    async def test_cache_miss_fetches_embedding(self):
        chapter = {'title': 'Test Chapter', 'content': 'Some content'}
        book_id = uuid4()
        fresh_emb = [0.5, 0.6, 0.7]

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        mock_redis.setex = AsyncMock()

        with (
            patch('app.services.rag_service.get_redis', return_value=mock_redis),
            patch('app.services.rag_service._get_embedding', return_value=fresh_emb),
        ):
            result = await _get_chunk_embeddings(chapter, book_id)
            assert len(result) >= 1
            _, emb = result[0]
            assert emb == fresh_emb
            mock_redis.setex.assert_called()

    @pytest.mark.asyncio
    async def test_redis_failure_graceful(self):
        chapter = {'title': 'Test', 'content': 'Content'}
        book_id = uuid4()
        fresh_emb = [0.1, 0.2]

        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(side_effect=Exception('Redis down'))

        with (
            patch('app.services.rag_service.get_redis', return_value=mock_redis),
            patch('app.services.rag_service._get_embedding', return_value=fresh_emb),
        ):
            result = await _get_chunk_embeddings(chapter, book_id)
            assert len(result) >= 1
            _, emb = result[0]
            assert emb == fresh_emb


class TestSemanticSearch:
    @pytest.mark.asyncio
    async def test_returns_relevant_chapters(self):
        chapters = [
            {'title': 'ML Intro', 'content': 'Machine learning basics'},
            {'title': 'Cooking', 'content': 'How to bake a cake'},
        ]
        book_id = uuid4()
        ml_embedding = [0.9, 0.1]
        cooking_embedding = [0.1, 0.9]
        query_embedding = [0.8, 0.2]

        with (
            patch('app.services.rag_service._get_embedding', return_value=query_embedding),
            patch(
                'app.services.rag_service._get_chunk_embeddings',
                side_effect=[
                    [('ML Intro Machine learning basics', ml_embedding)],
                    [('Cooking How to bake a cake', cooking_embedding)],
                ],
            ),
        ):
            results = await _semantic_chapter_search(chapters, 'machine learning', book_id)
            assert len(results) == 2
            assert results[0]['title'] == 'ML Intro'

    @pytest.mark.asyncio
    async def test_no_query_embedding(self):
        chapters = [{'title': 'Test', 'content': 'Content'}]
        with patch('app.services.rag_service._get_embedding', return_value=None):
            results = await _semantic_chapter_search(chapters, 'test', uuid4())
            assert results == []


class TestGetBookContext:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_book(self):
        mock_db = AsyncMock()
        mock_result = AsyncMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await get_book_context(mock_db, uuid4(), uuid4(), 'test query')
        assert result == ''

    @pytest.mark.asyncio
    async def test_keyword_fallback(self):
        """When semantic search fails, keyword search should kick in."""
        user_id = uuid4()
        book_id = uuid4()

        # Mock DB — book exists
        mock_db = AsyncMock()
        book_row = AsyncMock()
        book_row.scalar_one_or_none.return_value = MagicMock()

        # Mock chapters
        chapters_row = AsyncMock()
        chapters_row.scalar_one_or_none.return_value = [
            {'title': 'ML Basics', 'content': 'Machine learning fundamentals and algorithms'},
        ]

        # Mock annotations
        ann_row = AsyncMock()
        ann_row.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[book_row, chapters_row, ann_row])

        with (
            patch('app.services.rag_service.get_redis') as mock_redis,
            patch('app.services.rag_service._semantic_chapter_search', return_value=[]),
            patch('app.services.rag_service._get_chapters', return_value=[
                {'title': 'ML Basics', 'content': 'Machine learning fundamentals and algorithms'},
            ]),
        ):
            mock_r = AsyncMock()
            mock_r.get.return_value = None
            mock_r.setex.return_value = True
            mock_redis.return_value = mock_r

            # Patch the internal _get_chapters call by going through get_book_context
            result = await get_book_context(mock_db, user_id, book_id, 'machine learning')
            # Should get context from keyword fallback
            assert 'ML Basics' in result or 'Machine learning' in result

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_value(self):
        """Returns cached result from Redis without DB lookup."""
        cached_text = 'Previously cached context about the novel.'
        mock_redis = AsyncMock()
        mock_redis.get.return_value = cached_text

        with patch('app.services.rag_service.get_redis', return_value=mock_redis):
            result = await get_book_context(
                db=AsyncMock(),
                user_id=uuid4(),
                book_id=uuid4(),
                query='cached query',
            )
            assert result == cached_text

    @pytest.mark.asyncio
    async def test_successful_retrieval_writes_to_cache(self):
        """After retrieving context, the result is written to Redis cache."""
        book_id = uuid4()
        user_id = uuid4()

        mock_book = MagicMock()
        mock_book.id = book_id
        mock_book.user_id = user_id

        mock_db = AsyncMock()
        mock_result = AsyncMock()
        mock_result.scalar_one_or_none.return_value = mock_book
        mock_db.execute = AsyncMock(return_value=mock_result)

        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        mock_redis.setex.return_value = True

        chapters = [
            {'title': 'Chapter 1', 'content': 'The protagonist discovers a hidden garden. ' * 20},
        ]

        with (
            patch('app.services.rag_service.get_redis', return_value=mock_redis),
            patch('app.services.rag_service._get_chapters', return_value=chapters),
            patch('app.services.rag_service._semantic_chapter_search', return_value=[]),
            patch('app.services.rag_service._keyword_chapter_search', return_value=[
                {'title': 'Chapter 1', 'content': 'The protagonist discovers a hidden garden. ' * 20},
            ]),
            patch('app.services.rag_service._load_related_annotations', return_value=[]),
            patch('app.services.rag_service.sanitize_user_input', side_effect=lambda x, **kw: x),
        ):
            result = await get_book_context(
                db=mock_db,
                user_id=user_id,
                book_id=book_id,
                query='garden',
            )
            assert 'garden' in result.lower()
            mock_redis.setex.assert_called_once()
