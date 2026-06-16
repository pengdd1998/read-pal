"""P2.2 tests: progress-aware spoiler prevention.

Validates that ``build_system_prompt`` emits the correct spoiler block
based on the reader's progress:
- Completed book: spoiler block lifted
- Unknown progress (no total_pages or page 0): conservative early-stage warning
- Active reading: standard page-anchored spoiler prevention

Previously the embedded template always emitted the active block, which
misled the model when the user had finished the book (it would refuse
to discuss the ending) or had unknown progress (it would see "page 0
of 0" and behave erratically).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.companion.context_prompts import (
    _build_spoiler_block,
    _is_book_completed,
    _is_progress_unknown,
    build_system_prompt,
)


@dataclass
class FakeBook:
    """Minimal Book stand-in for prompt tests."""
    title: str = 'Test Book'
    author: str = 'Test Author'
    progress: float = 0
    current_page: int = 0
    total_pages: int = 0
    current_segment: int = 0
    status: str = 'unread'


class TestIsBookCompleted:
    def test_completed_status(self):
        assert _is_book_completed(FakeBook(status='completed'))

    def test_progress_at_100(self):
        """Defensive: progress reaches 100 even if status didn't flip."""
        assert _is_book_completed(FakeBook(progress=100, current_page=500, total_pages=500))

    def test_page_at_total(self):
        """Page-level signal: current_page reached total_pages."""
        assert _is_book_completed(FakeBook(current_page=300, total_pages=300))

    def test_active_reading_not_completed(self):
        assert not _is_book_completed(FakeBook(progress=50, current_page=250, total_pages=500))

    def test_just_started_not_completed(self):
        assert not _is_book_completed(FakeBook(progress=0, current_page=0, total_pages=500))


class TestIsProgressUnknown:
    def test_zero_total_pages(self):
        """EPUB without page count — can't anchor spoiler block to pages."""
        assert _is_progress_unknown(FakeBook(total_pages=0))

    def test_page_zero(self):
        """User hasn't started reading yet."""
        assert _is_progress_unknown(FakeBook(total_pages=500, current_page=0))

    def test_active_reading_is_known(self):
        assert not _is_progress_unknown(FakeBook(total_pages=500, current_page=250))


class TestBuildSpoilerBlock:
    def test_completed_uses_completed_block(self):
        block = _build_spoiler_block(
            FakeBook(status='completed', current_page=500, total_pages=500),
            lang='en',
        )
        assert 'finished' in block.lower()
        # Should NOT contain the active spoiler text
        assert 'CRITICAL SPOILER PREVENTION' not in block

    def test_unknown_progress_uses_unknown_block(self):
        block = _build_spoiler_block(FakeBook(total_pages=0), lang='en')
        assert 'early stage' in block.lower()
        # Should NOT contain page-specific wording
        assert 'CRITICAL SPOILER PREVENTION' not in block

    def test_active_reading_uses_active_block(self):
        block = _build_spoiler_block(
            FakeBook(progress=50, current_page=250, total_pages=500),
            lang='en',
        )
        assert 'CRITICAL SPOILER PREVENTION' in block
        assert 'page 250 of 500' in block

    def test_zh_translation_present(self):
        """ZH locale gets the localized block, not the EN fallback."""
        block = _build_spoiler_block(
            FakeBook(status='completed'), lang='zh',
        )
        assert '已完成' in block


class TestBuildSystemPromptIntegration:
    """Verify the spoiler block interpolates correctly into the full prompt."""

    def test_active_reading_prompt_contains_specific_page(self):
        book = FakeBook(progress=50, current_page=250, total_pages=500)
        prompt = build_system_prompt(book, annotations_ctx='')
        assert 'page 250 of 500' in prompt
        assert 'CRITICAL SPOILER PREVENTION' in prompt

    def test_completed_prompt_does_not_prevent_spoilers(self):
        """Regression: completed book shouldn't refuse ending discussion."""
        book = FakeBook(status='completed', progress=100, current_page=500, total_pages=500)
        prompt = build_system_prompt(book, annotations_ctx='')
        assert 'CRITICAL SPOILER PREVENTION' not in prompt
        assert 'finished' in prompt.lower()

    def test_unknown_progress_avoids_page_zero_wording(self):
        """Regression: don't render 'page 0 of 0' which confuses the model."""
        book = FakeBook(total_pages=0, current_page=0)
        prompt = build_system_prompt(book, annotations_ctx='')
        assert 'page 0 of 0' not in prompt
        assert 'early stage' in prompt.lower()

    def test_socratic_mode_also_uses_spoiler_block(self):
        """Both system and socratic prompts share the spoiler block logic."""
        book = FakeBook(status='completed')
        prompt = build_system_prompt(book, annotations_ctx='', companion_mode='socratic')
        assert 'SOCRATIC mode' in prompt
        assert 'CRITICAL SPOILER PREVENTION' not in prompt
