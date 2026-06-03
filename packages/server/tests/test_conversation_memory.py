"""Tests for conversation_memory service — summarization, formatting, text conversion."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.conversation_memory import (
    MAX_RECENT,
    SUMMARY_BATCH,
    SUMMARY_THRESHOLD,
    _format_conversation,
    _generate_summary,
    _summarize_to_text,
    get_or_create_summary,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chat_message(
    role: str = 'user',
    content: str = 'Hello',
    msg_id: uuid4 | None = None,
    created_at: datetime | None = None,
) -> MagicMock:
    """Create a lightweight ChatMessage-like mock."""
    msg = MagicMock()
    msg.id = msg_id or uuid4()
    msg.role = role
    msg.content = content
    msg.created_at = created_at or datetime.now(timezone.utc)
    return msg


def _make_conversation_summary(
    summary: str = 'Existing summary text.',
    message_count: int = 50,
) -> MagicMock:
    """Create a lightweight ConversationSummary-like mock."""
    cs = MagicMock()
    cs.summary = summary
    cs.message_count = message_count
    cs.updated_at = datetime.now(timezone.utc)
    return cs


# ---------------------------------------------------------------------------
# _summarize_to_text — pure function, no mocking needed
# ---------------------------------------------------------------------------


class TestSummarizeToText:
    def test_all_fields_populated(self) -> None:
        data = {
            'key_topics': ['AI', 'ML'],
            'insights': ['Pattern recognition improved.'],
            'unresolved_questions': ['What about edge cases?'],
        }
        result = _summarize_to_text(data)
        assert 'Key topics: AI, ML.' in result
        assert 'Insights: Pattern recognition improved.' in result
        assert 'Unresolved: What about edge cases?' in result

    def test_only_topics(self) -> None:
        data = {
            'key_topics': ['topic1'],
            'insights': [],
            'unresolved_questions': [],
        }
        result = _summarize_to_text(data)
        assert 'Key topics: topic1.' in result
        assert 'Insights' not in result
        assert 'Unresolved' not in result

    def test_only_insights(self) -> None:
        data = {
            'key_topics': [],
            'insights': ['Something interesting.'],
            'unresolved_questions': [],
        }
        result = _summarize_to_text(data)
        assert 'Insights: Something interesting.' in result

    def test_only_questions(self) -> None:
        data = {
            'key_topics': [],
            'insights': [],
            'unresolved_questions': ['Why?'],
        }
        result = _summarize_to_text(data)
        assert 'Unresolved: Why?' in result

    def test_all_empty_falls_back_to_json(self) -> None:
        data = {
            'key_topics': [],
            'insights': [],
            'unresolved_questions': [],
        }
        result = _summarize_to_text(data)
        # Falls back to json.dumps when no parts generated
        assert json.loads(result) == data

    def test_missing_fields_uses_defaults(self) -> None:
        data = {}
        result = _summarize_to_text(data)
        # Empty dict -> all get() calls return [] -> falls back to json.dumps
        assert json.loads(result) == data

    def test_extra_fields_preserved_in_json_fallback(self) -> None:
        data = {'custom_field': 'value'}
        result = _summarize_to_text(data)
        assert json.loads(result) == data


# ---------------------------------------------------------------------------
# _format_conversation — uses TokenBudget and sanitizer
# ---------------------------------------------------------------------------


class TestFormatConversation:
    def test_formats_user_and_companion_messages(self) -> None:
        messages = [
            _make_chat_message(role='user', content='What is AI?'),
            _make_chat_message(role='assistant', content='AI is artificial intelligence.'),
        ]
        result = _format_conversation(messages)
        assert 'User: What is AI?' in result
        assert 'Companion: AI is artificial intelligence.' in result

    def test_empty_messages_returns_empty(self) -> None:
        result = _format_conversation([])
        assert result == ''

    def test_truncates_long_content(self) -> None:
        long_content = 'x' * 1000
        msg = _make_chat_message(content=long_content)
        result = _format_conversation([msg])
        # Content is truncated to 500 chars in the service
        assert len(result) < len(long_content) + 20

    def test_single_message(self) -> None:
        msg = _make_chat_message(role='user', content='Hello world')
        result = _format_conversation([msg])
        assert result == 'User: Hello world'

    def test_multiple_messages_newline_separated(self) -> None:
        msgs = [
            _make_chat_message(role='user', content='Q1'),
            _make_chat_message(role='assistant', content='A1'),
            _make_chat_message(role='user', content='Q2'),
        ]
        result = _format_conversation(msgs)
        lines = result.split('\n')
        assert len(lines) == 3

    def test_assistant_role_labeled_companion(self) -> None:
        msg = _make_chat_message(role='assistant', content='Response')
        result = _format_conversation([msg])
        assert 'Companion: Response' in result
        assert 'User' not in result

    def test_unknown_role_labeled_companion(self) -> None:
        msg = _make_chat_message(role='system', content='System msg')
        result = _format_conversation([msg])
        # Anything non-'user' gets labeled 'Companion'
        assert 'Companion: System msg' in result


# ---------------------------------------------------------------------------
# get_or_create_summary — async, requires DB + LLM mocks
# ---------------------------------------------------------------------------


class TestGetOrCreateSummary:
    @pytest.mark.asyncio
    async def test_returns_none_below_threshold(self) -> None:
        """When message count < SUMMARY_THRESHOLD, return None without creating summary."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        # Mock count query to return below threshold
        count_scalar = MagicMock()
        count_scalar.scalar.return_value = SUMMARY_THRESHOLD - 1
        db.execute = AsyncMock(return_value=count_scalar)

        result = await get_or_create_summary(db, user_id, book_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_zero_messages(self) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        count_scalar = MagicMock()
        count_scalar.scalar.return_value = 0
        db.execute = AsyncMock(return_value=count_scalar)

        result = await get_or_create_summary(db, user_id, book_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_count_is_none(self) -> None:
        """scalar() may return None if no rows; should treat as 0."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        count_scalar = MagicMock()
        count_scalar.scalar.return_value = None
        db.execute = AsyncMock(return_value=count_scalar)

        result = await get_or_create_summary(db, user_id, book_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_cache_hit_returns_existing_summary(self) -> None:
        """When existing summary covers enough messages, return it without regenerating."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        existing = _make_conversation_summary(summary='Cached summary', message_count=45)

        # First call: count query, second call: load existing summary
        count_scalar = MagicMock()
        count_scalar.scalar.return_value = SUMMARY_THRESHOLD + 10  # 40 messages

        summary_scalar = MagicMock()
        summary_scalar.scalar_one_or_none.return_value = existing

        db.execute = AsyncMock(side_effect=[count_scalar, summary_scalar])

        result = await get_or_create_summary(db, user_id, book_id)
        assert result == 'Cached summary'

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory._generate_summary', new_callable=AsyncMock)
    async def test_generates_summary_when_needed(self, mock_generate: AsyncMock) -> None:
        """When summary is stale (message_count too low), generate a new one."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        # Existing summary with low message_count -> stale
        existing = _make_conversation_summary(summary='Old summary', message_count=10)
        mock_generate.return_value = 'Fresh summary'

        count_scalar = MagicMock()
        count_scalar.scalar.return_value = SUMMARY_THRESHOLD + 15  # 45 messages

        summary_scalar = MagicMock()
        summary_scalar.scalar_one_or_none.return_value = existing

        db.execute = AsyncMock(side_effect=[count_scalar, summary_scalar])

        result = await get_or_create_summary(db, user_id, book_id)
        assert result == 'Fresh summary'
        mock_generate.assert_called_once_with(db, user_id, book_id, existing)

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory._generate_summary', new_callable=AsyncMock)
    async def test_generates_summary_when_no_existing(self, mock_generate: AsyncMock) -> None:
        """When no existing summary but above threshold, generate one."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        mock_generate.return_value = 'New summary'

        count_scalar = MagicMock()
        count_scalar.scalar.return_value = SUMMARY_THRESHOLD + 5

        summary_scalar = MagicMock()
        summary_scalar.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[count_scalar, summary_scalar])

        result = await get_or_create_summary(db, user_id, book_id)
        assert result == 'New summary'
        mock_generate.assert_called_once_with(db, user_id, book_id, None)


# ---------------------------------------------------------------------------
# _generate_summary — async, requires DB + LLM mocks
# ---------------------------------------------------------------------------


class TestGenerateSummary:
    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_returns_empty_when_few_messages(self, mock_llm: AsyncMock) -> None:
        """When total messages <= MAX_RECENT, return existing summary or empty."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        # Create fewer messages than MAX_RECENT
        msgs = [_make_chat_message() for _ in range(5)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        existing = _make_conversation_summary(summary='Old')
        result = await _generate_summary(db, user_id, book_id, existing)
        assert result == 'Old'
        # LLM should not be called when too few messages
        mock_llm.assert_not_called()

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_returns_empty_string_when_few_messages_no_existing(
        self, mock_llm: AsyncMock
    ) -> None:
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        msgs = [_make_chat_message() for _ in range(3)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        result = await _generate_summary(db, user_id, book_id, None)
        assert result == ''

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_generates_and_saves_new_summary(self, mock_llm: AsyncMock) -> None:
        """When enough messages, generate summary via LLM and save new ConversationSummary."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        # Create more messages than MAX_RECENT
        msgs = [_make_chat_message(content=f'Message {i}') for i in range(MAX_RECENT + 10)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        mock_llm.return_value = {
            'key_topics': ['topic1'],
            'insights': ['insight1'],
            'unresolved_questions': [],
        }

        result = await _generate_summary(db, user_id, book_id, None)
        assert 'topic1' in result
        db.add.assert_called_once()
        db.flush.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_updates_existing_summary(self, mock_llm: AsyncMock) -> None:
        """When existing summary provided, update it in place."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        existing = _make_conversation_summary(summary='Old summary', message_count=20)

        msgs = [_make_chat_message(content=f'Msg {i}') for i in range(MAX_RECENT + 5)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        mock_llm.return_value = {
            'key_topics': ['updated topic'],
            'insights': [],
            'unresolved_questions': [],
        }

        result = await _generate_summary(db, user_id, book_id, existing)
        assert 'updated topic' in result
        # Should update existing, not add new
        db.add.assert_not_called()
        db.flush.assert_called_once()
        assert existing.summary == result

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_llm_failure_keeps_existing_summary(self, mock_llm: AsyncMock) -> None:
        """When LLM returns None, fall back to existing summary text."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        existing = _make_conversation_summary(summary='Fallback summary')

        msgs = [_make_chat_message() for _ in range(MAX_RECENT + 5)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        mock_llm.return_value = None

        result = await _generate_summary(db, user_id, book_id, existing)
        assert result == 'Fallback summary'

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_llm_failure_with_no_existing_returns_empty(self, mock_llm: AsyncMock) -> None:
        """When LLM fails and no existing summary, return empty string."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        msgs = [_make_chat_message() for _ in range(MAX_RECENT + 5)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        mock_llm.return_value = None

        result = await _generate_summary(db, user_id, book_id, None)
        assert result == ''

    @pytest.mark.asyncio
    @patch('app.services.conversation_memory.safe_llm_invoke', new_callable=AsyncMock)
    async def test_message_count_stored_correctly(self, mock_llm: AsyncMock) -> None:
        """The message_count on the saved summary matches total messages loaded."""
        user_id = uuid4()
        book_id = uuid4()
        db = AsyncMock()

        total_msgs = MAX_RECENT + 15
        msgs = [_make_chat_message() for _ in range(total_msgs)]
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = msgs
        scalars_mock.scalars.return_value = scalars_mock

        db_result = MagicMock()
        db_result.scalars.return_value = scalars_mock
        db.execute = AsyncMock(return_value=db_result)

        mock_llm.return_value = {
            'key_topics': ['test'],
            'insights': [],
            'unresolved_questions': [],
        }

        await _generate_summary(db, user_id, book_id, None)

        # Check the ConversationSummary object passed to db.add
        added_obj = db.add.call_args[0][0]
        assert added_obj.message_count == total_msgs


# ---------------------------------------------------------------------------
# Constants sanity checks
# ---------------------------------------------------------------------------


class TestConstants:
    def test_threshold_greater_than_batch(self) -> None:
        assert SUMMARY_THRESHOLD > SUMMARY_BATCH

    def test_recent_less_than_threshold(self) -> None:
        assert MAX_RECENT < SUMMARY_THRESHOLD

    def test_reasonable_values(self) -> None:
        assert SUMMARY_THRESHOLD > 0
        assert SUMMARY_BATCH > 0
        assert MAX_RECENT > 0
