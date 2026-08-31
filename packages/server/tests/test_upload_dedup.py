"""Per-user upload dedup — same EPUB bytes return the existing book.

The pre-dedup behavior created a second Book + Document on every re-upload,
re-parsed the file, and re-ran the embedding precompute (real vendor cost).
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models.book import Book
from app.services import upload_service


def _book(content_hash='a' * 64, file_size=1234):
    b = MagicMock(spec=Book)
    b.id = uuid4()
    b.content_hash = content_hash
    b.file_size = file_size
    return b


class TestFindExistingBookByHash:
    @pytest.mark.asyncio
    async def test_matches_same_user_hash_and_size(self):
        db = AsyncMock()
        existing = _book()
        result = MagicMock()
        result.scalar_one_or_none.return_value = existing
        db.execute = AsyncMock(return_value=result)

        found = await upload_service.find_existing_book_by_hash(
            db, uuid4(), 'a' * 64, 1234,
        )
        assert found is existing

    @pytest.mark.asyncio
    async def test_no_match_returns_none(self):
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)

        assert await upload_service.find_existing_book_by_hash(
            db, uuid4(), 'b' * 64, 1234,
        ) is None


class TestStreamHash:
    @pytest.mark.asyncio
    async def test_stream_returns_sha256(self, tmp_path):
        class FakeUpload:
            filename = 'x.epub'
            _sent = False
            async def read(self, _n):
                if not self._sent:
                    self._sent = True
                    return b'hello world'
                return b''

        import os
        import app.services.upload_stream as upload_stream
        with patch.object(upload_stream, 'tempfile') as tf:
            f = tmp_path / 'x.epub'
            f.write_bytes(b'hello world')
            tf.NamedTemporaryFile.return_value.__enter__.return_value.name = str(f)
            tf.NamedTemporaryFile.return_value.__exit__.return_value = False
            path, size, digest = await upload_service.stream_upload_to_tempfile(FakeUpload())

        assert size == 11
        assert digest == 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
