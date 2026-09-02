"""PG gating regression (design r2): two users, same book bytes.

User A uploads content; user B uploads the SAME bytes (dedup → shared
book_contents). A's RAG search must surface shared chunks, B's must too,
and NEITHER may see content scoped to the other's shelf beyond the shared
hash. Ownership gate stays upstream (Book lookup by user); this pins it.
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.rag.context import _fetch_book_and_spoiler_limit
from app.services.rag import search as rag_search
from app.services.rag.context import _search_relevant_chunks
from tests.conftest import _TestSession


@pytest.mark.asyncio
async def test_shared_chunks_serve_both_users_and_gate_stays_upstream():
    from sqlalchemy import text

    user_a, user_b, book_a = uuid4(), uuid4(), uuid4()
    shared_hash = 'c' * 64

    async with _TestSession() as db:
        # Seed: two users, each with a book row referencing the same hash
        await db.execute(text(
            "INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES "
            "(:i, 'a@x', 'h', 'A', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), "
            "(:j, 'b@x', 'h', 'B', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ), {'i': user_a, 'j': user_b})
        await db.execute(text(
            "INSERT INTO book_contents (content_hash, file_size, file_type, title, author, created_at) "
            "VALUES (:h, 1, 'epub', 'Shared', 'A', CURRENT_TIMESTAMP)"
        ), {'h': shared_hash})
        await db.execute(text(
            "INSERT INTO books (id, user_id, title, author, file_type, file_size, "
            "total_pages, current_page, status, progress, scroll_progress, added_at, created_at, updated_at, content_hash) VALUES "
            "(:i, :u, 'Shared Book', 'A', 'epub', 1, 1, 0, 'unread', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :h), "
            "(:j, :u2, 'Shared Book', 'A', 'epub', 1, 1, 0, 'unread', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, :h)"
        ), {'i': book_a, 'u': user_a, 'j': uuid4(), 'u2': user_b, 'h': shared_hash})
        # One shared chunk (uploaded by A, keyed by hash). Timestamps are
        # explicit: SQLite test schema strips server_defaults (ORM-only
        # fallbacks), so raw SQL must not rely on them.
        await db.execute(text(
            "INSERT INTO documents (id, book_id, user_id, content, chapters, created_at, updated_at) VALUES "
            "(:dk, :ba, :ua, 'shared passage', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
        ), {'ba': book_a, 'ua': user_a, 'dk': __import__('uuid').uuid4()})
        await db.execute(text(
            "INSERT INTO book_chunks (id, book_id, document_id, chapter_index, "
            "chunk_index, content, content_hash, created_at) VALUES "
            "(:ck, :ba, :dk, 0, 0, 'shared passage', :h, CURRENT_TIMESTAMP)"
        ), {'ba': book_a, 'h': shared_hash,
            'ck': __import__('uuid').uuid4(), 'dk': __import__('uuid').uuid4()})
        await db.commit()

        # B's ownership lookup: B's own book resolves with the shared hash
        book_b_row = (await db.execute(text(
            "SELECT b.content_hash FROM books b WHERE b.id = "
            "(SELECT id FROM books WHERE user_id = :u AND content_hash = :h) "
            "AND b.user_id = :u"
        ), {'u': user_b, 'h': shared_hash})).scalar()
        assert book_b_row == shared_hash

        # Spoiler gate: B looks up THEIR book by (id, user) — A's book is invisible
        book_b_id = (await db.execute(text(
            "SELECT id FROM books WHERE user_id = :u AND content_hash = :h"
        ), {'u': user_b, 'h': shared_hash})).scalar()
        found_a, _ = await _fetch_book_and_spoiler_limit(db, user_b, book_a)
        assert found_a is None, "B must not resolve A's book row"

        # RAG: B's search (book_id=B's copy, hash=shared) surfaces the shared chunk
        with patch.object(rag_search, '_get_embedding',
                          new=AsyncMock(return_value=[0.1] * 4)):
            got_b = await _search_relevant_chunks(
                db, book_b_id, 'shared passage', 3, None, content_hash=shared_hash,
            )
        assert got_b, 'B must see shared chunks for their own book'
