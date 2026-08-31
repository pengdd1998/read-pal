"""Upload streaming + dedup primitives.

Split from upload_service.py (400-line services cap): the byte-streaming
hash temp-file writer and the per-user dedup lookup live here; upload_service
re-exports them so existing import paths are unchanged.
"""

import hashlib
import logging

from fastapi import UploadFile

from pathlib import Path


def get_file_type(filename: str) -> str:
    """Extract file type from filename."""
    return Path(filename).suffix.lower().lstrip('.')
import os
import tempfile

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.models.book import Book
from app.utils.db import db_error_guard

logger = logging.getLogger('read-pal.upload')

# Mirrored from upload_service.MAX_FILE_SIZE (single source would create an
# import cycle: upload_service re-exports from this module).
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

async def stream_upload_to_tempfile(
    file: UploadFile,
    max_size: int = MAX_FILE_SIZE,
) -> tuple[str, int, str]:
    """Stream uploaded file to a temp file, hashing as it lands.

    Returns (tmp_path, file_size, sha256_hex) — the hash feeds per-user
    upload dedup, so it is computed on the single streaming pass rather
    than a second read.
    Raises ValueError if the file exceeds *max_size*.
    """
    file_type = get_file_type(file.filename or '')
    file_size = 0
    hasher = hashlib.sha256()

    with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_type}') as tmp:
        tmp_path = tmp.name
        while chunk := await file.read(1024 * 1024):
            hasher.update(chunk)
            file_size += len(chunk)
            if file_size > max_size:
                tmp.close()
                os.unlink(tmp_path)
                raise ValueError(
                    f'File exceeds {max_size // (1024 * 1024)} MB limit'
                )
            tmp.write(chunk)

    return tmp_path, file_size, hasher.hexdigest()


# ---------------------------------------------------------------------------
# Book creation orchestrator
# ---------------------------------------------------------------------------



async def find_existing_book_by_hash(
    db: AsyncSession,
    user_id: UUID,
    content_hash: str,
    file_size: int,
) -> Book | None:
    """Find this user's earlier upload of the exact same file bytes.

    Hash alone is a 2^-256 collision story; pairing it with file_size
    makes accidental false positives effectively impossible. Books
    uploaded before 0026 have NULL hashes and never match.
    """
    async with db_error_guard('upload_service.find_existing_book_by_hash'):
        result = await db.execute(
            select(Book).where(
                Book.user_id == user_id,
                Book.content_hash == content_hash,
                Book.file_size == file_size,
            ).limit(1),
        )
        return result.scalar_one_or_none()


