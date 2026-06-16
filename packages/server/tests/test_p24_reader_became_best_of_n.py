"""P2.4 tests: Best-of-N with consistency check for reader_became.

Validates the high-stakes closing essay runs N=3 times in parallel and:
- Returns the first valid result for determinism
- Logs a divergence warning when runs disagree on key_transformation
- Returns an error stub only when all N attempts fail
- Does not warn when runs are consistent
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.memory_book.section_generation import (
    _DIVERGENCE_WARN_THRESHOLD,
    _READER_BECAME_N,
    _content_words,
    _generate_reader_became_best_of_n,
    _jaccard,
)


def test_reader_became_n_is_3():
    """Defense against accidentally tuning N down (cost) or up (latency)."""
    assert _READER_BECAME_N == 3


def test_content_words_strips_stop_words_and_short_tokens():
    """Only content words survive — syntax glue is dropped."""
    words = _content_words('The reader became a more thoughtful person!')
    assert words == {'reader', 'became', 'more', 'thoughtful', 'person'}


def test_content_words_handles_empty_input():
    assert _content_words('') == set()
    assert _content_words(None) == set()  # type: ignore[arg-type]


def test_jaccard_identical_sets_return_one():
    assert _jaccard({'a', 'b', 'c'}, {'a', 'b', 'c'}) == 1.0


def test_jaccard_disjoint_sets_return_zero():
    assert _jaccard({'a', 'b'}, {'c', 'd'}) == 0.0


def test_jaccard_both_empty_returns_zero():
    """Avoid the divide-by-zero trap when both runs produced empty fields."""
    assert _jaccard(set(), set()) == 0.0


@pytest.mark.asyncio
async def test_returns_first_valid_when_all_succeed():
    """3 valid results — returns first, no divergence warning if consistent."""
    consistent_results = [
        {
            'type': 'reader_became',
            'essay': 'You became a more attentive reader.',
            'key_transformation': 'grew more patient with difficult passages',
            'parting_question': 'What will you read next?',
        },
        {
            'type': 'reader_became',
            'essay': 'Your reading became deeper.',
            'key_transformation': 'grew more patient with difficult texts',
            'parting_question': 'Where to next?',
        },
        {
            'type': 'reader_became',
            'essay': 'You learned to sit with hard ideas.',
            'key_transformation': 'grew more patient with difficult ideas',
            'parting_question': 'What now?',
        },
    ]

    async def fake_generate(*args, **kwargs):
        return consistent_results.pop(0)

    warning_events: list[str] = []

    def fake_warning(event, **kwargs):
        warning_events.append(event)

    with patch(
        'app.services.memory_book.section_generation._generate_section',
        new=fake_generate,
    ):
        with patch(
            'app.services.memory_book.section_generation.logger.warning',
            new=fake_warning,
        ):
            result = await _generate_reader_became_best_of_n(
                enriched_data={}, user_id=None, book_id=None,
            )

    assert result['essay'] == 'You became a more attentive reader.'
    # Consistent transformations ⇒ no divergence warning.
    assert 'reader_became_best_of_n_divergent' not in warning_events


@pytest.mark.asyncio
async def test_logs_divergence_warning_when_runs_disagree():
    """High disagreement on key_transformation triggers the warning."""
    divergent_results = [
        {
            'type': 'reader_became',
            'essay': 'essay A',
            'key_transformation': 'became interested in philosophy',
            'parting_question': 'q1',
        },
        {
            'type': 'reader_became',
            'essay': 'essay B',
            'key_transformation': 'developed discipline for daily reading',
            'parting_question': 'q2',
        },
        {
            'type': 'reader_became',
            'essay': 'essay C',
            'key_transformation': 'learned to love difficult characters',
            'parting_question': 'q3',
        },
    ]

    async def fake_generate(*args, **kwargs):
        return divergent_results.pop(0)

    warning_events: list[str] = []

    def fake_warning(event, **kwargs):
        warning_events.append(event)

    with patch(
        'app.services.memory_book.section_generation._generate_section',
        new=fake_generate,
    ):
        with patch(
            'app.services.memory_book.section_generation.logger.warning',
            new=fake_warning,
        ):
            result = await _generate_reader_became_best_of_n(
                enriched_data={}, user_id=None, book_id=None,
            )

    # Still returns first valid for determinism.
    assert result['essay'] == 'essay A'
    # Divergence warning fired.
    assert 'reader_became_best_of_n_divergent' in warning_events, (
        'expected divergence warning when key_transformation disagrees across runs'
    )


@pytest.mark.asyncio
async def test_returns_error_when_all_attempts_fail():
    """All N produce error stubs — return error stub, log all_failed warning."""

    async def fake_generate(*args, **kwargs):
        return {'type': 'reader_became', 'error': 'generation failed'}

    warning_events: list[str] = []

    def fake_warning(event, **kwargs):
        warning_events.append(event)

    with patch(
        'app.services.memory_book.section_generation._generate_section',
        new=fake_generate,
    ):
        with patch(
            'app.services.memory_book.section_generation.logger.warning',
            new=fake_warning,
        ):
            result = await _generate_reader_became_best_of_n(
                enriched_data={}, user_id=None, book_id=None,
            )

    assert 'error' in result
    assert 'reader_became_best_of_n_all_failed' in warning_events


@pytest.mark.asyncio
async def test_mixed_valid_and_invalid_returns_first_valid():
    """Schema failures on some attempts are masked by valid ones."""
    results = [
        {'type': 'reader_became', 'error': 'transient'},
        {
            'type': 'reader_became',
            'essay': 'valid essay',
            'key_transformation': 'grew more confident',
            'parting_question': 'q',
        },
        {'type': 'reader_became', 'error': 'also transient'},
    ]

    async def fake_generate(*args, **kwargs):
        return results.pop(0)

    warning_events: list[str] = []

    def fake_warning(event, **kwargs):
        warning_events.append(event)

    with patch(
        'app.services.memory_book.section_generation._generate_section',
        new=fake_generate,
    ):
        with patch(
            'app.services.memory_book.section_generation.logger.warning',
            new=fake_warning,
        ):
            result = await _generate_reader_became_best_of_n(
                enriched_data={}, user_id=None, book_id=None,
            )

    # First valid is returned; no all_failed warning.
    assert result['essay'] == 'valid essay'
    assert 'reader_became_best_of_n_all_failed' not in warning_events


def test_divergence_threshold_is_sane():
    """Threshold should reward real content overlap, not noise."""
    assert 0.2 <= _DIVERGENCE_WARN_THRESHOLD <= 0.5
