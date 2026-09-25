"""Post-stream faithfulness filter tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.companion.faithfulness import (
    _extract_context,
    _split_sentences,
    check_faithfulness,
    format_annotation,
)


class TestSplitSentences:
    def test_chinese_sentence_split(self):
        text = "这是第一句。这是第二句！这是第三句？"
        sentences = _split_sentences(text)
        assert len(sentences) == 3

    def test_english_sentence_split(self):
        text = "First sentence. Second sentence! Third?"
        sentences = _split_sentences(text)
        assert len(sentences) == 3

    def test_newline_split(self):
        text = "Line one.\nLine two.\n\nLine three."
        sentences = _split_sentences(text)
        assert len(sentences) >= 2

    def test_empty_and_short(self):
        assert _split_sentences('') == []
        assert _split_sentences('！') == []
        assert _split_sentences('好') == []


class TestExtractContext:
    def test_extracts_book_passages(self):
        msg = MagicMock()
        msg.content = 'System prompt...\n<book_passages>\nPassage content here\n</book_passages>\n...'
        result = _extract_context([msg])
        assert 'Passage content here' in result

    def test_no_passages_returns_empty(self):
        msg = MagicMock()
        msg.content = 'No passages in this prompt'
        assert _extract_context([msg]) == ''

    def test_multiple_messages(self):
        msg1 = MagicMock()
        msg1.content = 'Human message'
        msg2 = MagicMock()
        msg2.content = 'System...\n<book_passages>\nBook text\n</book_passages>'
        result = _extract_context([msg1, msg2])
        assert 'Book text' in result


class TestCheckFaithfulness:
    @pytest.mark.asyncio
    async def test_disabled_returns_none(self):
        with patch('app.config.get_settings') as gs:
            gs.return_value = MagicMock(faithfulness_check_enabled=False)
            result = await check_faithfulness('test', [])
            assert result is None

    @pytest.mark.asyncio
    async def test_no_context_returns_none(self):
        with patch('app.config.get_settings') as gs:
            gs.return_value = MagicMock(faithfulness_check_enabled=True)
            msg = MagicMock()
            msg.content = 'No passages'
            result = await check_faithfulness('A sentence. Another one.', [msg])
            assert result is None

    @pytest.mark.asyncio
    async def test_too_few_sentences_returns_none(self):
        with patch('app.config.get_settings') as gs:
            gs.return_value = MagicMock(faithfulness_check_enabled=True)
            msg = MagicMock()
            msg.content = '<book_passages>\nSome long context here\n</book_passages>'
            result = await check_faithfulness('One sentence.', [msg])
            assert result is None

    @pytest.mark.asyncio
    async def test_llm_returns_indices(self):
        settings = MagicMock(faithfulness_check_enabled=True)
        with (
            patch('app.config.get_settings', return_value=settings),
            patch('app.services.llm.safe_invoke.safe_llm_call',
                  new=AsyncMock(return_value='[0, 2]')),
        ):
            msg = MagicMock()
            msg.content = '<book_passages>\nBook context about 潜行者 and 造访区 and many more details about the story here.\n</book_passages>'
            result = await check_faithfulness(
                'Unsupported claim. Supported fact. Another unsupported.', [msg],
            )
            assert result == [0, 2]

    @pytest.mark.asyncio
    async def test_llm_failure_returns_none(self):
        settings = MagicMock(faithfulness_check_enabled=True)
        with (
            patch('app.config.get_settings', return_value=settings),
            patch('app.services.llm.safe_invoke.safe_llm_call',
                  new=AsyncMock(side_effect=RuntimeError('api down'))),
        ):
            msg = MagicMock()
            msg.content = '<book_passages>\nBook context with sufficient length to pass the minimum threshold check.\n</book_passages>'
            result = await check_faithfulness('First sentence. Second sentence.', [msg])
            assert result is None

    @pytest.mark.asyncio
    async def test_invalid_indices_filtered(self):
        settings = MagicMock(faithfulness_check_enabled=True)
        with (
            patch('app.config.get_settings', return_value=settings),
            patch('app.services.llm.safe_invoke.safe_llm_call',
                  new=AsyncMock(return_value='[0, 99, -1]')),
        ):
            msg = MagicMock()
            msg.content = '<book_passages>\nBook context with sufficient length to pass the minimum threshold check.\n</book_passages>'
            result = await check_faithfulness('First. Second. Third.', [msg])
            assert result == [0]  # only valid index kept


class TestFormatAnnotation:
    def test_formats_warning(self):
        text = 'Supported. Unsupported detail. More text.'
        annotation = format_annotation([1], text)
        assert '⚠️' in annotation
        assert '1 处' in annotation
        assert 'Unsupported detail'[:20] in annotation

    def test_empty_indices_returns_empty(self):
        assert format_annotation([], 'Some text') == ''
