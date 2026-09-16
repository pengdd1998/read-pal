"""Step 2 read-switch: book_contents serves chapters when content_hash set."""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services import upload_service


def _shared_row():
    row = MagicMock()
    row.raw_chapters = [
        {'title': 'Ch1', 'content': 'plain text', 'rawContent': '<p>plain text</p>'},
    ]
    row.chapters = [{'title': 'Ch1', 'content': 'plain text'}]
    return row


def _book(content_hash='f' * 64):
    book = MagicMock()
    book.id = uuid4()
    book.content_hash = content_hash
    book.title = 'Shared Book'
    book.file_type = MagicMock()
    book.file_type.value = 'epub'
    return book


@pytest.mark.asyncio
async def test_shared_row_serves_chapters_without_document_query():
    """When a shared row exists, the legacy Document query never runs."""
    db = AsyncMock()
    book = _book()
    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book
    shared_result = MagicMock()
    shared_result.scalar_one_or_none.return_value = _shared_row()

    db.execute = AsyncMock(side_effect=[book_result, shared_result])

    with patch.object(upload_service, '_get_cached_chapters', new=AsyncMock(return_value=None)):
        out = await upload_service.get_book_content(db, uuid4(), book.id, 'en', slim=True)

    assert out is not None
    assert out['chapters'][0]['rawContent'] == '<p>plain text</p>'
    # only two queries: book lookup + shared lookup (no Document query)
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_missing_shared_row_falls_back_to_document():
    """No shared row (pre-0026 book) → legacy Document path still works."""
    db = AsyncMock()
    book = _book(content_hash=None)
    book.content_hash = None
    book.title = 'Legacy Book'
    book.author = 'Author'
    book.tags = []
    book.metadata_ = {}
    book.progress = 0
    book.current_segment = 0
    book_result = MagicMock()
    book_result.scalar_one_or_none.return_value = book
    doc_result = MagicMock()
    doc_result.scalar_one_or_none.return_value = None

    db.execute = AsyncMock(side_effect=[book_result, doc_result])

    with patch.object(upload_service, '_get_cached_chapters', new=AsyncMock(return_value=None)), \
         patch.object(upload_service, '_build_chapters', return_value=[]), \
         patch.object(upload_service, '_extract_content', return_value=''), \
         patch.object(upload_service, '_put_cached_chapters', new=AsyncMock()):
        out = await upload_service.get_book_content(db, uuid4(), book.id, 'en', slim=True)

    assert out is not None  # fallback path produced a response
    assert db.execute.await_count == 2
