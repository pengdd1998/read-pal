"""Repair books whose content_hash has no matching book_contents row.

Pre-existing stragglers from the deploy window between migration 0026
(column added) and the dual-write wiring: the book was stamped with the
raw-file SHA-256 but the shared parse payload was never stored. Current
upload code writes both in one transaction, so this state can no longer
be produced — this script only repairs historical rows.

For each dangling book, builds the book_contents row from its own
Document (INSERT .. ON CONFLICT DO NOTHING) and marks it
``metadata.legacy_repair = true``.

Dry-run by default; --apply writes in one transaction.

Usage::

    cd packages/server && uv run python scripts/repair_dangling_content_rows.py
    uv run python scripts/repair_dangling_content_rows.py --apply
"""
from __future__ import annotations

import asyncio
import logging
import sys
from uuid import UUID

sys.path.insert(0, 'app/..')

from sqlalchemy import select, text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book import Book  # noqa: E402
from app.models.book_content import BookContent  # noqa: E402
from app.models.document import Document  # noqa: E402

logger = logging.getLogger('read-pal.content-repair')


async def _dangling(s) -> list[tuple[Book, Document]]:
    rows = (await s.execute(
        select(Book, Document)
        .join(Document, Document.book_id == Book.id)
        .where(Book.content_hash.isnot(None))
        .where(~select(BookContent.content_hash).where(
            BookContent.content_hash == Book.content_hash).exists())
    )).all()
    return rows


async def main(apply: bool) -> None:
    async with async_session() as s:
        rows = await _dangling(s)
        if not rows:
            print("No dangling books — every stamped content_hash resolves.")
            return
        for book, _doc in rows:
            print(f"[{'apply' if apply else 'dry'}] {book.title[:40]!r} "
                  f"hash={book.content_hash[:16]}…")
        if not apply:
            print(f"DRY-RUN: {len(rows)} books need a book_contents row")
            return

        from sqlalchemy.dialects.postgresql import insert as pg_insert

        for book, doc in rows:
            await s.execute(pg_insert(BookContent).values(
                content_hash=book.content_hash,
                file_size=book.file_size,
                file_type=book.file_type.value if hasattr(
                    book.file_type, 'value') else str(book.file_type),
                title=book.title,
                author=book.author,
                chapters=doc.chapters,
                raw_chapters=doc.chapters,
                total_pages=book.total_pages or len(doc.chapters or []),
                metadata_={'legacy_repair': True},
            ).on_conflict_do_nothing(index_elements=['content_hash']))
        await s.commit()

    # Re-check from a fresh session.
    async with async_session() as s:
        left = (await s.execute(text(
            "SELECT count(*) FROM books b LEFT JOIN book_contents bc "
            "ON bc.content_hash = b.content_hash "
            "WHERE b.content_hash IS NOT NULL AND bc.content_hash IS NULL"
        ))).scalar()
    print(f"APPLIED: repaired {len(rows)} rows; dangling refs remaining: {left}")


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main('--apply' in sys.argv))
