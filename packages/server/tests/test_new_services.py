"""Tests for newly extracted service modules: chat, mood, feedback, intervention."""

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.chat_service import get_chat_history
from app.services.mood_service import _build_fallback, _parse_response, generate_mood_scene
from app.services.feedback_service import submit_feedback


# ---------------------------------------------------------------------------
# chat_service
# ---------------------------------------------------------------------------


class TestGetChatHistory:
    """Tests for chat_service.get_chat_history."""

    @pytest.mark.asyncio
    async def test_returns_messages_ordered_by_date(self):
        user_id = uuid4()
        msg1 = MagicMock(
            id=uuid4(), book_id=uuid4(), role='user',
            content='Hello', created_at=None,
        )
        msg2 = MagicMock(
            id=uuid4(), book_id=uuid4(), role='assistant',
            content='Hi there', created_at=None,
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [msg2, msg1]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await get_chat_history(db, user_id)

        assert len(result) == 2
        assert result[0]['role'] == 'assistant'
        assert result[1]['role'] == 'user'
        assert result[0]['content'] == 'Hi there'

    @pytest.mark.asyncio
    async def test_filters_by_book_id(self):
        user_id = uuid4()
        book_id = uuid4()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await get_chat_history(db, user_id, book_id=book_id)

        # Verify the query was executed
        db.execute.assert_called_once()
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_respects_limit(self):
        user_id = uuid4()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        await get_chat_history(db, user_id, limit=10)

        db.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_serializes_ids_as_strings(self):
        user_id = uuid4()
        book_id = uuid4()
        msg_id = uuid4()

        msg = MagicMock(
            id=msg_id, book_id=book_id, role='user',
            content='test', created_at=None,
        )

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [msg]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        result = await get_chat_history(db, user_id)

        assert isinstance(result[0]['id'], str)
        assert isinstance(result[0]['bookId'], str)


# ---------------------------------------------------------------------------
# mood_service
# ---------------------------------------------------------------------------


class TestBuildFallback:
    def test_returns_expected_keys(self):
        result = _build_fallback('happy')
        assert result['mood'] == 'happy'
        assert 'scene' in result
        assert 'suggestion' in result
        assert 'color' in result

    def test_scene_includes_mood(self):
        result = _build_fallback('dreamy')
        assert 'dreamy' in result['scene']


class TestParseResponse:
    def test_parses_valid_json(self):
        raw = json.dumps({
            'scene': 'A serene garden',
            'suggestion': 'Breathe deeply',
            'color': '#2E8B57',
        })
        result = _parse_response(raw, 'calm')
        assert result['mood'] == 'calm'
        assert result['scene'] == 'A serene garden'
        assert result['color'] == '#2E8B57'

    def test_strips_markdown_fences(self):
        raw = '```json\n{"scene": "test", "suggestion": "test", "color": "#000"}\n```'
        result = _parse_response(raw, 'neutral')
        assert result['scene'] == 'test'

    def test_fills_missing_keys_from_fallback(self):
        raw = json.dumps({'scene': 'Partial'})
        result = _parse_response(raw, 'sad')
        assert result['scene'] == 'Partial'
        assert result['mood'] == 'sad'
        # suggestion and color come from fallback
        assert 'suggestion' in result
        assert 'color' in result


class TestGenerateMoodScene:
    @pytest.mark.asyncio
    async def test_returns_fallback_on_llm_failure(self):
        with patch('app.services.mood_service.safe_llm_call', side_effect=Exception('LLM down')):
            result = await generate_mood_scene(None, None, 'happy')
        assert result['mood'] == 'happy'
        assert 'scene' in result

    @pytest.mark.asyncio
    async def test_returns_fallback_on_empty_response(self):
        with patch('app.services.mood_service.safe_llm_call', return_value=''):
            result = await generate_mood_scene(None, None, 'calm')
        assert result['mood'] == 'calm'

    @pytest.mark.asyncio
    async def test_parses_valid_llm_response(self):
        llm_response = json.dumps({
            'scene': 'Moonlit library',
            'suggestion': 'Read by candlelight',
            'color': '#1a1a2e',
        })
        with patch('app.services.mood_service.safe_llm_call', return_value=llm_response):
            result = await generate_mood_scene(None, None, 'mysterious')
        assert result['scene'] == 'Moonlit library'
        assert result['mood'] == 'mysterious'

    @pytest.mark.asyncio
    async def test_handles_invalid_json_from_llm(self):
        with patch('app.services.mood_service.safe_llm_call', return_value='not json at all'):
            result = await generate_mood_scene(None, None, 'confused')
        assert result['mood'] == 'confused'
        # Should fallback gracefully
        assert 'scene' in result


# ---------------------------------------------------------------------------
# feedback_service
# ---------------------------------------------------------------------------


class TestSubmitFeedback:
    @pytest.mark.asyncio
    async def test_creates_and_returns_feedback(self):
        user_id = uuid4()
        book_id = uuid4()

        db = AsyncMock()
        # Mock flush to simulate the ID being set
        async def mock_flush():
            pass
        db.flush = mock_flush

        result = await submit_feedback(db, user_id, book_id, 'msg-123', True, 'Great!')

        assert result['rating'] is True

    @pytest.mark.asyncio
    async def test_works_without_optional_fields(self):
        user_id = uuid4()
        book_id = uuid4()

        db = AsyncMock()
        db.flush = AsyncMock()

        result = await submit_feedback(db, user_id, book_id, None, False)

        assert result['rating'] is False

    @pytest.mark.asyncio
    async def test_adds_to_session(self):
        user_id = uuid4()
        book_id = uuid4()

        db = AsyncMock()
        db.flush = AsyncMock()

        await submit_feedback(db, user_id, book_id, 'msg-456', True, 'Helpful')

        db.add.assert_called_once()


# ---------------------------------------------------------------------------
# intervention_service (pure functions)
# ---------------------------------------------------------------------------


class TestInterventionHelpers:
    """Test pure helper functions from intervention_service."""

    def test_compute_page_range(self):
        from app.services.intervention_service import compute_page_range

        mock_session = MagicMock(pages_read=10)
        earlier = [MagicMock(pages_read=5), MagicMock(pages_read=3)]

        start, end = compute_page_range(earlier, mock_session)
        assert start == 9  # 5 + 3 + 1
        assert end == 18   # 5 + 3 + 10

    def test_compute_page_range_no_earlier(self):
        from app.services.intervention_service import compute_page_range

        mock_session = MagicMock(pages_read=10)
        start, end = compute_page_range([], mock_session)
        assert start == 1
        assert end == 10

    def test_pages_overlap_pct_no_overlap(self):
        from app.services.intervention_service import pages_overlap_pct

        assert pages_overlap_pct((1, 3), (4, 6)) == 0.0

    def test_pages_overlap_pct_full_overlap(self):
        from app.services.intervention_service import pages_overlap_pct

        assert pages_overlap_pct((1, 5), (1, 5)) == 1.0

    def test_pages_overlap_pct_partial(self):
        from app.services.intervention_service import pages_overlap_pct

        result = pages_overlap_pct((1, 5), (4, 8))
        assert 0.0 < result < 1.0

    def test_default_prefs_has_all_keys(self):
        from app.services.intervention_service import DEFAULT_PREFS

        expected_keys = {
            'marathonEnabled', 'longSessionEnabled', 'lowEngagementEnabled',
            'welcomeBackEnabled', 'speedDropEnabled', 'reReadingEnabled',
            'optimalTimingEnabled', 'quietHoursStart', 'quietHoursEnd',
        }
        assert set(DEFAULT_PREFS.keys()) == expected_keys

    def test_threshold_constants_reasonable(self):
        from app.services.intervention_service import (
            LONG_SESSION_MINUTES, MARATHON_SESSIONS, GAP_DAYS,
            SPEED_DROP_THRESHOLD, RE_READING_OVERLAP,
        )

        assert LONG_SESSION_MINUTES > 0
        assert MARATHON_SESSIONS > 0
        assert GAP_DAYS > 0
        assert 0 < SPEED_DROP_THRESHOLD < 1
        assert 0 < RE_READING_OVERLAP <= 1
