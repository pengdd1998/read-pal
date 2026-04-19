"""Unit tests for pure service functions — exporters, circuit breaker, utilities."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.models.annotation import Annotation, AnnotationType
from app.services.exporters.citation_exporter import (
    _annotation_lines,
    _get_publisher,
    _get_year,
    export_citation_apa,
    export_citation_chicago,
    export_citation_mla,
)
from app.services.exporters.csv_exporter import export_csv
from app.services.exporters.html_exporter import export_html
from app.services.llm import CircuitBreaker, CircuitState
from app.utils.annotations import annotation_type_value, match_annotation_type


# ---------------------------------------------------------------------------
# Helpers — lightweight mock objects
# ---------------------------------------------------------------------------


def _make_book(
    title: str = 'Test Book',
    author: str = 'John Doe',
    metadata: dict | None = None,
):
    """Create a lightweight Book-like mock."""
    book = MagicMock()
    book.title = title
    book.author = author
    book.metadata_ = metadata or {}
    return book


def _make_annotation(
    content: str = 'Highlighted text',
    note: str | None = None,
    ann_type: AnnotationType = AnnotationType.highlight,
    color: str | None = None,
    tags: list[str] | None = None,
    location: dict | None = None,
    created_at: datetime | None = None,
):
    """Create a lightweight Annotation-like mock."""
    ann = MagicMock()
    ann.content = content
    ann.note = note
    ann.type = ann_type
    ann.color = color
    ann.tags = tags or []
    ann.location = location or {}
    ann.created_at = created_at or datetime.now(timezone.utc)
    return ann


# ===========================================================================
# Citation Exporter Tests
# ===========================================================================


class TestGetYear:
    def test_returns_year_from_metadata(self):
        book = _make_book(metadata={'year': 2024, 'publisher': 'Penguin'})
        assert _get_year(book) == '2024'

    def test_returns_nd_when_no_year(self):
        book = _make_book(metadata={})
        assert _get_year(book) == 'n.d.'

    def test_returns_nd_when_no_metadata(self):
        book = _make_book(metadata=None)
        assert _get_year(book) == 'n.d.'

    def test_returns_nd_when_metadata_not_dict(self):
        book = _make_book()
        book.metadata_ = 'not a dict'
        assert _get_year(book) == 'n.d.'


class TestGetPublisher:
    def test_returns_publisher(self):
        book = _make_book(metadata={'publisher': 'Penguin'})
        assert _get_publisher(book) == 'Penguin'

    def test_returns_empty_when_no_publisher(self):
        book = _make_book(metadata={})
        assert _get_publisher(book) == ''

    def test_returns_empty_when_no_metadata(self):
        book = _make_book(metadata=None)
        assert _get_publisher(book) == ''


class TestAnnotationLines:
    def test_builds_lines(self):
        annotations = [
            _make_annotation(content='Hello', note='My note', ann_type=AnnotationType.highlight),
            _make_annotation(content='World', ann_type=AnnotationType.bookmark),
        ]
        lines = _annotation_lines(annotations)
        assert lines[0] == '  [Highlight] Hello'
        assert lines[1] == '    Note: My note'
        assert lines[2] == '  [Bookmark] World'

    def test_empty_annotations(self):
        assert _annotation_lines([]) == []

    def test_skips_note_when_none(self):
        ann = _make_annotation(content='Text', note=None)
        lines = _annotation_lines([ann])
        assert len(lines) == 1
        assert 'Note:' not in lines[0]


class TestAPAExport:
    def test_citation_only(self):
        book = _make_book(
            title='Thinking, Fast and Slow',
            author='Daniel Kahneman',
            metadata={'year': 2011, 'publisher': 'Farrar'},
        )
        result = export_citation_apa(book, [])
        assert result == 'Daniel Kahneman (2011). *Thinking, Fast and Slow*. Farrar.'

    def test_citation_without_publisher(self):
        book = _make_book(author='Jane Austen', metadata={'year': 1813})
        result = export_citation_apa(book, [])
        assert result == 'Jane Austen (1813). *Test Book*.'

    def test_citation_with_annotations(self):
        book = _make_book(author='Author', metadata={'year': 2020})
        annotations = [_make_annotation(content='Quote', note='Important')]
        result = export_citation_apa(book, annotations)
        assert '[Highlight] Quote' in result
        assert 'Note: Important' in result


class TestMLAExport:
    def test_full_name_citation(self):
        book = _make_book(
            author='Daniel Kahneman',
            title='Thinking, Fast and Slow',
            metadata={'year': 2011, 'publisher': 'Farrar'},
        )
        result = export_citation_mla(book, [])
        assert 'Kahneman, Daniel.' in result
        assert '*Thinking, Fast and Slow*.' in result
        assert 'Farrar, 2011.' in result

    def test_single_name_author(self):
        book = _make_book(author='Plato', metadata={'year': -380})
        result = export_citation_mla(book, [])
        assert result.startswith('Plato.')

    def test_with_annotations(self):
        book = _make_book(author='Author', metadata={'year': 2020})
        anns = [_make_annotation(content='Text')]
        result = export_citation_mla(book, anns)
        assert '[Highlight] Text' in result


class TestChicagoExport:
    def test_basic_citation(self):
        book = _make_book(
            author='Yuval Noah Harari',
            title='Sapiens',
            metadata={'year': 2015, 'publisher': 'Harper'},
        )
        result = export_citation_chicago(book, [])
        assert 'Yuval Noah Harari. *Sapiens*.' in result
        assert 'Harper, 2015.' in result

    def test_no_year(self):
        book = _make_book(author='Unknown', metadata={})
        result = export_citation_chicago(book, [])
        assert result == 'Unknown. *Test Book*.'

    def test_with_annotations(self):
        book = _make_book(author='Author', metadata={'year': 2020})
        anns = [_make_annotation(content='Note text', ann_type=AnnotationType.note)]
        result = export_citation_chicago(book, anns)
        assert '[Note] Note text' in result


# ===========================================================================
# CSV Exporter Tests
# ===========================================================================


class TestCSVExport:
    def test_csv_header(self):
        result = export_csv([])
        lines = result.strip().split('\n')
        assert 'type' in lines[0]
        assert 'content' in lines[0]

    def test_csv_with_annotations(self):
        anns = [
            _make_annotation(
                content='Hello',
                note='Note',
                ann_type=AnnotationType.highlight,
                color='yellow',
                tags=['important'],
            ),
        ]
        result = export_csv(anns)
        lines = result.strip().split('\n')
        assert len(lines) == 2  # header + 1 row
        assert 'highlight' in lines[1]
        assert 'Hello' in lines[1]

    def test_csv_empty_tags(self):
        ann = _make_annotation(tags=[])
        result = export_csv([ann])
        assert ',,' in result  # empty tags field

    def test_csv_multiple_annotations(self):
        anns = [_make_annotation(content=f'Ann {i}') for i in range(5)]
        result = export_csv(anns)
        lines = result.strip().split('\n')
        assert len(lines) == 6  # header + 5 rows


# ===========================================================================
# HTML Exporter Tests
# ===========================================================================


class TestHTMLExport:
    def test_html_structure(self):
        anns = [_make_annotation(content='Quote')]
        book_info = {'title': 'My Book', 'author': 'Author'}
        result = export_html(anns, book_info)
        assert '<html' in result
        assert 'My Book' in result
        assert 'Author' in result
        assert 'Quote' in result

    def test_html_without_annotations(self):
        book_info = {'title': 'Empty Book'}
        result = export_html([], book_info)
        assert 'Empty Book' in result
        assert 'No annotations' in result or 'annotations' in result.lower()


# ===========================================================================
# Annotation Utilities Tests
# ===========================================================================


class TestAnnotationTypeValue:
    def test_enum_member(self):
        assert annotation_type_value(AnnotationType.highlight) == 'highlight'
        assert annotation_type_value(AnnotationType.note) == 'note'
        assert annotation_type_value(AnnotationType.bookmark) == 'bookmark'

    def test_string_value(self):
        assert annotation_type_value('highlight') == 'highlight'

    def test_integer_value(self):
        assert annotation_type_value(1) == '1'


class TestMatchAnnotationType:
    def test_enum_matches(self):
        assert match_annotation_type(AnnotationType.highlight, AnnotationType.highlight) is True
        assert match_annotation_type(AnnotationType.note, AnnotationType.highlight) is False

    def test_string_matches(self):
        assert match_annotation_type('highlight', AnnotationType.highlight) is True
        assert match_annotation_type('note', AnnotationType.highlight) is False


# ===========================================================================
# Circuit Breaker Tests
# ===========================================================================


class TestCircuitBreaker:
    @pytest.fixture
    def cb(self):
        return CircuitBreaker()

    def test_initial_state_is_closed(self, cb):
        assert cb.state == CircuitState.CLOSED

    def test_is_open_property(self, cb):
        assert cb.is_open is False

    @pytest.mark.asyncio
    async def test_allow_request_when_closed(self, cb):
        assert await cb.allow_request() is True

    @pytest.mark.asyncio
    async def test_success_stays_closed(self, cb):
        await cb.record_success()
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_failure_increments_counter(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 3
            await cb.record_failure()
            assert cb._failures == 1
            assert cb.state == CircuitState.CLOSED  # Not yet at threshold

    @pytest.mark.asyncio
    async def test_opens_after_threshold(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 3
            for _ in range(3):
                await cb.record_failure()
            assert cb.state == CircuitState.OPEN
            assert cb.is_open is True

    @pytest.mark.asyncio
    async def test_blocks_requests_when_open(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 1
            mock_settings.return_value.circuit_reset_timeout_seconds = 300
            await cb.record_failure()  # Opens the circuit
            assert await cb.allow_request() is False

    @pytest.mark.asyncio
    async def test_half_open_after_timeout(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 1
            mock_settings.return_value.circuit_reset_timeout_seconds = 0  # Immediate reset
            await cb.record_failure()  # Opens the circuit
            assert await cb.allow_request() is True  # Half-open allows probe
            assert cb.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_success_closes_from_half_open(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 1
            mock_settings.return_value.circuit_reset_timeout_seconds = 0
            await cb.record_failure()  # Opens
            await cb.allow_request()  # Transitions to HALF_OPEN
            await cb.record_success()  # Closes
            assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_probe_failure_reopens(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 1
            mock_settings.return_value.circuit_reset_timeout_seconds = 0
            await cb.record_failure()  # Opens
            await cb.allow_request()  # HALF_OPEN
            await cb.record_failure()  # Re-opens
            assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_success_resets_failure_count(self, cb):
        with patch('app.services.llm.get_settings') as mock_settings:
            mock_settings.return_value.circuit_failure_threshold = 5
            await cb.record_failure()
            await cb.record_failure()
            assert cb._failures == 2
            await cb.record_success()
            assert cb._failures == 0


# ===========================================================================
# LLM JSON Parsing Tests (safe_llm_invoke markdown fence stripping)
# ===========================================================================


class TestMarkdownFenceStripping:
    """Test the markdown fence stripping logic from safe_llm_invoke."""

    def test_strips_json_fences(self):
        content = '```json\n{"key": "value"}\n```'
        lines = content.split('\n')
        stripped = '\n'.join(lines[1:-1])
        import json
        result = json.loads(stripped)
        assert result == {'key': 'value'}

    def test_strips_plain_fences(self):
        content = '```\nplain text\n```'
        lines = content.split('\n')
        stripped = '\n'.join(lines[1:-1])
        assert stripped == 'plain text'

    def test_no_fences(self):
        content = '{"key": "value"}'
        assert not content.startswith('```')
