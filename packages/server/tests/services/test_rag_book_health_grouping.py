"""H3.1 (P-H): rag_book_health groups same-content copies into one row.

Production walkthrough (09-25) showed 20+ rows for what is 4 distinct
books — the same book uploaded by several accounts (identical
content_hash) rendered one row per copy. Grouping collapses them with a
copy count; genuinely zero-chunk books still surface individually.
"""
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.book import Book
from app.models.book_chunk import BookChunk
from app.services.llm.rag_queries import rag_book_health
from tests.conftest import _TestSession

HASH_A = 'a' * 64
HASH_B = 'b' * 64


def _book(file_hash: str | None, title: str) -> Book:
    return Book(
        user_id=uuid4(),
        title=title,
        author='A',
        file_type='epub',
        file_size=1,
        content_hash=file_hash,
        total_pages=0,
    )


def _chunk(book_id, file_hash: str | None) -> BookChunk:
    return BookChunk(
        book_id=book_id,
        document_id=None,
        chapter_index=0,
        chunk_index=0,
        content='x' * 20,
        content_hash=file_hash,
        embedding=None,
    )


@pytest.mark.asyncio
async def test_shared_hash_copies_collapse_to_one_row():
    async with _TestSession() as db:
        b1, b2, b3 = _book(HASH_A, 'Shared'), _book(HASH_A, 'Shared'), _book(HASH_B, 'Other')
        db.add_all([b1, b2, b3])
        await db.flush()
        db.add_all([_chunk(b1.id, HASH_A), _chunk(None, HASH_A), _chunk(b3.id, HASH_B)])
        await db.commit()

        data = await rag_book_health(db)

        shared = next(r for r in data['books'] if r['title'] == 'Shared')
        assert shared['copies'] == 2
        assert shared['chunks'] == 2  # count scope matches on content_hash
        assert shared['status'] == 'ok'

        other = next(r for r in data['books'] if r['title'] == 'Other')
        assert other['copies'] == 1 and other['chunks'] == 1

        # cleanup so the shared fixture table stays clean for other tests
        for chunk in (await db.execute(select(BookChunk))).scalars():
            await db.delete(chunk)
        for book in (await db.execute(select(Book).where(Book.title.in_(['Shared', 'Other'])))).scalars():
            await db.delete(book)
        await db.commit()


@pytest.mark.asyncio
async def test_zero_chunk_books_surface_individually():
    async with _TestSession() as db:
        z1, z2 = _book(None, 'ZeroOne'), _book(None, 'ZeroTwo')
        db.add_all([z1, z2])
        await db.commit()

        data = await rag_book_health(db)

        zero_rows = [r for r in data['books'] if r['title'] in ('ZeroOne', 'ZeroTwo')]
        assert len(zero_rows) == 2
        assert all(r['chunks'] == 0 and r['status'] == 'zero_chunks' for r in zero_rows)
        assert all(r['copies'] == 1 for r in zero_rows)

        for book in (await db.execute(select(Book).where(Book.title.in_(['ZeroOne', 'ZeroTwo'])))).scalars():
            await db.delete(book)
        await db.commit()
