"""Tests for upload_service — file validation, content retrieval, book creation."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.upload_service import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    _build_chapters,
    _extract_content,
    create_book_with_content,
    get_book_content,
    get_file_type,
    validate_file,
)


# ---------------------------------------------------------------------------
# validate_file
# ---------------------------------------------------------------------------


class TestValidateFile:
    def test_valid_epub(self):
        assert validate_file('book.epub', 1024) is None

    def test_valid_pdf(self):
        assert validate_file('paper.pdf', 1024) is None

    def test_invalid_extension(self):
        result = validate_file('photo.jpg', 1024)
        assert result is not None
        assert '.jpg' in result

    def test_no_extension(self):
        result = validate_file('noext', 1024)
        assert result is not None

    def test_file_too_large(self):
        result = validate_file('big.pdf', MAX_FILE_SIZE + 1)
        assert result is not None
        assert '100' in result  # 100 MB in message

    def test_exactly_max_size_is_ok(self):
        assert validate_file('book.epub', MAX_FILE_SIZE) is None

    def test_zero_size_is_ok(self):
        assert validate_file('book.epub', 0) is None

    def test_case_insensitive_extension(self):
        assert validate_file('BOOK.EPUB', 1024) is None
        assert validate_file('Paper.PDF', 1024) is None

    def test_double_extension(self):
        # Path('.epub.pdf').suffix == '.pdf'
        assert validate_file('archive.epub.pdf', 1024) is None


# ---------------------------------------------------------------------------
# get_file_type
# ---------------------------------------------------------------------------


class TestGetFileType:
    def test_epub(self):
        assert get_file_type('my_book.epub') == 'epub'

    def test_pdf(self):
        assert get_file_type('paper.pdf') == 'pdf'

    def test_uppercase(self):
        assert get_file_type('BOOK.EPUB') == 'epub'

    def test_unknown(self):
        assert get_file_type('data.txt') == 'txt'

    def test_no_extension(self):
        assert get_file_type('noext') == ''

    def test_double_dot(self):
        assert get_file_type('archive.tar.gz') == 'gz'


# ---------------------------------------------------------------------------
# _extract_content
# ---------------------------------------------------------------------------


class TestExtractContent:
    def test_returns_doc_content(self):
        doc = MagicMock()
        doc.content = 'Hello world'
        assert _extract_content(doc) == 'Hello world'

    def test_falls_back_to_chapters(self):
        doc = MagicMock()
        doc.content = ''
        doc.chapters = [
            {'content': 'Chapter 1'},
            {'content': 'Chapter 2'},
        ]
        result = _extract_content(doc)
        assert 'Chapter 1' in result
        assert 'Chapter 2' in result

    def test_skips_non_dict_chapters(self):
        doc = MagicMock()
        doc.content = ''
        doc.chapters = [{'content': 'Good'}, 'bad_string', None]
        result = _extract_content(doc)
        assert 'Good' in result

    def test_none_doc(self):
        assert _extract_content(None) == ''

    def test_no_content_no_chapters(self):
        doc = MagicMock(spec=[])
        assert _extract_content(doc) == ''


# ---------------------------------------------------------------------------
# _build_chapters
# ---------------------------------------------------------------------------


class TestBuildChapters:
    def test_builds_from_dict_chapters(self):
        doc = MagicMock()
        doc.chapters = [
            {'id': 'ch-1', 'title': 'Intro', 'content': 'Hello', 'rawContent': '<p>Hello</p>'},
            {'id': 'ch-2', 'title': 'End', 'content': 'Bye'},
        ]
        result = _build_chapters(doc, 'en')
        assert len(result) == 2
        assert result[0]['id'] == 'ch-1'
        assert result[1]['rawContent'] == '<p>Bye</p>'  # wraps plain text in <p>

    def test_html_content_used_directly_as_raw(self):
        doc = MagicMock()
        doc.chapters = [
            {'id': 'ch-1', 'title': 'Intro', 'content': '<p>Hello world</p>'},
        ]
        result = _build_chapters(doc, 'en')
        # content that already has HTML tags is used directly, not re-wrapped
        assert result[0]['rawContent'] == '<p>Hello world</p>'

    def test_default_id_when_missing(self):
        doc = MagicMock()
        doc.chapters = [{'title': 'X', 'content': 'Y'}]
        result = _build_chapters(doc, 'en')
        assert result[0]['id'] == '0'

    def test_default_title_when_missing(self):
        doc = MagicMock()
        doc.chapters = [{'id': 'ch-1', 'content': 'Y'}]
        result = _build_chapters(doc, 'en')
        # i18n key for chapter_title with index=1
        assert result[0]['title'] is not None

    def test_empty_chapters(self):
        doc = MagicMock()
        doc.chapters = []
        assert _build_chapters(doc, 'en') == []

    def test_none_doc(self):
        assert _build_chapters(None, 'en') == []

    def test_no_chapters_attr(self):
        doc = MagicMock(spec=[])
        assert _build_chapters(doc, 'en') == []

    def test_skips_non_dict_entries(self):
        doc = MagicMock()
        doc.chapters = [{'content': 'A'}, 'string', 42]
        result = _build_chapters(doc, 'en')
        assert len(result) == 1


# ---------------------------------------------------------------------------
# get_book_content
# ---------------------------------------------------------------------------


class TestGetBookContent:
    @pytest.mark.asyncio
    async def test_returns_none_when_book_not_found(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)

        result = await get_book_content(db, uuid4(), uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_book_and_chapters(self):
        user_id = uuid4()
        book_id = uuid4()

        book = MagicMock()
        book.id = book_id
        book.title = 'Test Book'
        book.author = 'Author'
        book.file_type = MagicMock(value='epub')
        book.file_size = 1024
        book.total_pages = 42
        book.current_page = 5
        book.current_segment = 2
        book.progress = 0.12
        book.status = MagicMock(value='reading')
        book.tags = ['fiction']
        book.metadata_ = {'key': 'val'}

        doc = MagicMock()
        doc.content = 'Some text'
        doc.chapters = [
            {'id': 'ch-1', 'title': 'Chapter 1', 'content': 'Hello'},
        ]

        # First execute call returns book, second returns doc
        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        doc_result = MagicMock()
        doc_result.scalar_one_or_none.return_value = doc
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[book_result, doc_result])

        result = await get_book_content(db, user_id, book_id)

        assert result is not None
        assert result['book']['title'] == 'Test Book'
        assert result['book']['author'] == 'Author'
        assert result['book']['fileType'] == 'epub'
        assert result['book']['progress'] == 0.12
        assert len(result['chapters']) == 1
        assert result['chapters'][0]['id'] == 'ch-1'

    @pytest.mark.asyncio
    async def test_generates_sample_when_no_content(self):
        user_id = uuid4()
        book_id = uuid4()

        book = MagicMock()
        book.id = book_id
        book.title = 'Empty Book'
        book.author = 'Nobody'
        book.file_type = 'pdf'
        book.file_size = 0
        book.total_pages = 0
        book.current_page = 0
        book.current_segment = None
        book.progress = None
        book.status = 'unread'
        book.tags = []
        book.metadata_ = None

        doc = MagicMock()
        doc.content = ''
        doc.chapters = []

        book_result = MagicMock()
        book_result.scalar_one_or_none.return_value = book
        doc_result = MagicMock()
        doc_result.scalar_one_or_none.return_value = doc
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[book_result, doc_result])

        result = await get_book_content(db, user_id, book_id)

        assert result is not None
        # Should have fallback sample content
        assert len(result['chapters']) >= 1
        assert result['chapters'][0]['id'] == 'sample-0'


# ---------------------------------------------------------------------------
# create_book_with_content
# ---------------------------------------------------------------------------


class TestCreateBookWithContent:
    @pytest.mark.asyncio
    async def test_creates_epub_book(self):
        user_id = uuid4()

        parser_result = {
            'total_pages': 100,
            'content': 'Book content here',
            'chapters': [
                {'id': 'ch-1', 'title': 'Intro', 'content': 'Hello', 'images': 2},
            ],
            'metadata': {'title': 'Real Title', 'author': 'Real Author'},
        }

        with (
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.process_pdf', new_callable=AsyncMock),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='file-stem-name',
                author='Unknown',
                file_type='epub',
                file_size=2048,
                file_path='/tmp/file-stem-name.epub',
                cover_url='https://example.com/cover.jpg',
                tags=['fiction'],
            )

            # Title/author overridden from metadata
            assert book.title == 'Real Title'
            assert book.author == 'Real Author'
            db.add.assert_called()
            assert db.flush.call_count == 2

    @pytest.mark.asyncio
    async def test_creates_pdf_book(self):
        user_id = uuid4()

        parser_result = {
            'total_pages': 50,
            'content': 'PDF content',
            'chapters': [],
            'metadata': {},
        }

        with (
            patch('app.services.upload_service.process_pdf', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='My PDF',
                author='Author',
                file_type='pdf',
                file_size=1024,
                file_path='/tmp/my.pdf',
            )

            assert book is not None
            # Title/author kept as-is since metadata has no overrides
            # and title != stem / author != 'Unknown'

    @pytest.mark.asyncio
    async def test_keeps_original_title_when_not_default(self):
        user_id = uuid4()

        parser_result = {
            'total_pages': 10,
            'content': '',
            'chapters': [],
            'metadata': {'title': 'Extracted Title'},
        }

        with (
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='Custom Title',
                author='Custom Author',
                file_type='epub',
                file_size=512,
                file_path='/tmp/custom.epub',
            )

            # Title stays "Custom Title" because it doesn't match file stem
            assert book.title == 'Custom Title'
            # Author stays "Custom Author" because it's not "Unknown"
            assert book.author == 'Custom Author'

    @pytest.mark.asyncio
    async def test_empty_metadata(self):
        user_id = uuid4()

        parser_result = {
            'total_pages': 5,
            'content': 'Text',
            'chapters': [],
            'metadata': {},
        }

        with (
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='My Book',
                author='Author',
                file_type='epub',
                file_size=256,
                file_path='/tmp/my.epub',
            )

            assert book is not None

    @pytest.mark.asyncio
    async def test_none_metadata_handled_gracefully(self):
        """Parser returns no 'metadata' key at all — get('metadata', {}) returns {}."""
        user_id = uuid4()

        parser_result = {
            'total_pages': 5,
            'content': 'Text',
            'chapters': [],
            # No 'metadata' key — .get('metadata', {}) yields {}
        }

        with (
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='My Book',
                author='Author',
                file_type='epub',
                file_size=256,
                file_path='/tmp/my.epub',
            )

            assert book is not None

    @pytest.mark.asyncio
    async def test_default_tags_when_none(self):
        user_id = uuid4()

        parser_result = {
            'total_pages': 5,
            'content': 'Text',
            'chapters': [],
            'metadata': {},
        }

        with (
            patch('app.services.upload_service.process_epub', new_callable=AsyncMock, return_value=parser_result),
            patch('app.services.upload_service.asyncio.create_task'),
        ):
            db = AsyncMock()
            db.flush = AsyncMock()
            db.refresh = AsyncMock()

            book = await create_book_with_content(
                db=db,
                user_id=user_id,
                title='Book',
                author='Author',
                file_type='epub',
                file_size=256,
                file_path='/tmp/book.epub',
                tags=None,
            )

            # tags=None => tags=[] in the Book constructor
            assert book.tags == []
