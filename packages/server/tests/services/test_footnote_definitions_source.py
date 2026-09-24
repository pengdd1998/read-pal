"""get_footnote_definitions: shared-row canonical read + legacy fallback.

2026-09-24 normalization: the per-book copies in books.metadata are legacy
duplication — the shared book_contents row is the canonical home (one copy
per content). Hash-bearing books read from the shared row; only books
without a content hash fall back to their own metadata.
"""

from __future__ import annotations

import pytest

from app.models.book import Book
from app.models.book_content import BookContent
from app.services.book_service import get_footnote_definitions
from tests.conftest import _TestSession, register_user


async def _seed_book(user_id: str, meta: dict, content_hash: str | None) -> Book:
    async with _TestSession() as session:
        book = Book(
            user_id=user_id,
            title='T',
            author='A',
            file_type='epub',
            file_size=1,
            status='unread',
            metadata_=meta,
            content_hash=content_hash,
        )
        session.add(book)
        await session.commit()
        await session.refresh(book)
        return book


@pytest.mark.asyncio
async def test_hash_book_reads_canonical_from_shared_row(client):
    reg = await register_user(client)
    async with _TestSession() as session:
        session.add(BookContent(
            content_hash='fn-canonical-hash', file_size=1, file_type='epub',
            title='T', author='A',
            raw_chapters=[{'title': '1', 'content': 'x', 'rawContent': 'x'}],
            metadata_={'footnote_definitions': {'rpfnd-ch0-note_1': 'canonical body'}},
        ))
        await session.commit()
    book = await _seed_book(reg['user']['id'], {'footnote_definitions': {'stale': 'old copy'}}, 'fn-canonical-hash')

    async with _TestSession() as session:
        defs = await get_footnote_definitions(session, reg['user']['id'], book.id)
    assert defs == {'rpfnd-ch0-note_1': 'canonical body'}


@pytest.mark.asyncio
async def test_hash_book_without_shared_row_falls_back_to_own_metadata(client):
    reg = await register_user(client)
    book = await _seed_book(
        reg['user']['id'], {'footnote_definitions': {'note_1': 'own copy'}}, 'fn-no-shared-row',
    )
    async with _TestSession() as session:
        defs = await get_footnote_definitions(session, reg['user']['id'], book.id)
    assert defs == {'note_1': 'own copy'}


@pytest.mark.asyncio
async def test_no_hash_book_reads_own_metadata(client):
    reg = await register_user(client)
    book = await _seed_book(
        reg['user']['id'], {'footnote_definitions': {'note_1': 'legacy'}}, None,
    )
    async with _TestSession() as session:
        defs = await get_footnote_definitions(session, reg['user']['id'], book.id)
    assert defs == {'note_1': 'legacy'}
