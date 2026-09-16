"""Shared book_contents dual-write (design r2 step 1).

Pure-DB tests against the real session fixture: the upsert is idempotent
and first-writer-wins; upload flow creates both Document (legacy) and
BookContent (shared) rows.
"""
from uuid import uuid4

import pytest

from app.models.book_content import BookContent
from app.services.upload_service import upsert_book_content
from tests.conftest import _TestSession


@pytest.mark.asyncio
async def test_upsert_creates_row():
    async with _TestSession() as db:
        await upsert_book_content(
            db, content_hash='d' * 64, file_size=1, file_type='epub',
            title='T', author='A', chapters=None, raw_chapters=None,
            total_pages=0, meta=None, cover_url=None, created_by=uuid4(),
        )
        await db.commit()
        row = (
            await db.execute(
                __import__('sqlalchemy').select(BookContent).where(
                    BookContent.content_hash == 'd' * 64)
            )
        ).scalar_one()
        assert row.title == 'T' and row.total_pages == 0


@pytest.mark.asyncio
async def test_upsert_idempotent_first_writer_wins():
    async with _TestSession() as db:
        for title in ('First', 'Second'):
            await upsert_book_content(
                db, content_hash='e' * 64, file_size=1, file_type='epub',
                title=title, author='A', chapters=None, raw_chapters=None,
                total_pages=0, meta=None, cover_url=None, created_by=uuid4(),
            )
        await db.commit()
        row = (
            await db.execute(
                __import__('sqlalchemy').select(BookContent).where(
                    BookContent.content_hash == 'e' * 64)
            )
        ).scalar_one()
        assert row.title == 'First'
