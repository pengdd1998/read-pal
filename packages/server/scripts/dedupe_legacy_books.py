"""Merge legacy duplicate books that provably share identical content.

Design r2 step 2 (backfill): books uploaded before the content-hash era
have NULL content_hash and one Document each. This script merges groups
whose Documents are PROVABLY identical (same title+author, same chapter
count, byte-identical serialized chapters) into one canonical
book_contents row; every book in the group then references it.

Documents are NOT deleted here (design keeps legacy read path until
verified) — dedupe happens on the next backfill pass after verification.

Dry-run by default; pass --apply to write.

Usage::

    cd packages/server && uv run python scripts/dedupe_legacy_books.py           # report
    uv run python scripts/dedupe_legacy_books.py --apply                          # merge
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sys

sys.path.insert(0, 'app/..')

from sqlalchemy import select, text  # noqa: E402

from app.db import async_session  # noqa: E402
from app.models.book import Book  # noqa: E402
from app.models.document import Document  # noqa: E402


def _fingerprint(doc: Document) -> str | None:
    """Byte-proof fingerprint of a Document's chapters (None if empty)."""
    if not doc.chapters:
        return None
    canonical = json.dumps(doc.chapters, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


async def main(apply: bool) -> None:
    merged_groups = 0
    merged_books = 0

    async with async_session() as s:
        # Candidate groups: same title+author, multiple legacy (hashless) books.
        groups = (await s.execute(text("""
            SELECT b.title, b.author, count(*) AS n
            FROM books b
            WHERE b.content_hash IS NULL
            GROUP BY b.title, b.author
            HAVING count(*) > 1
            ORDER BY n DESC
        """))).all()

        for title, author, n in groups:
            docs = (await s.execute(
                select(Book, Document)
                .join(Document, Document.book_id == Book.id)
                .where(Book.title == title, Book.author == author,
                       Book.content_hash.is_(None))
            )).all()

            by_fp: dict[str, list[tuple[Book, Document]]] = {}
            for book, doc in docs:
                fp = _fingerprint(doc)
                if fp:
                    by_fp.setdefault(fp, []).append((book, doc))

            for fp, members in by_fp.items():
                if len(members) < 2:
                    continue
                canonical_content_hash = 'legacy-' + fp
                keeper = members[0]
                merged_groups += 1
                merged_books += len(members) - 1

                if not apply:
                    print(f"[dry] {title[:32]!r} x{len(members)} → {canonical_content_hash[:24]}…")
                    continue

                # Insert the shared row once ( keeper's Document is canonical).
                _, keeper_doc = keeper
                from app.models.book_content import BookContent
                from sqlalchemy.dialects.postgresql import insert as pg_insert
                stmt = pg_insert(BookContent).values(
                    content_hash=canonical_content_hash,
                    file_size=0,
                    file_type='epub',
                    title=title,
                    author=author,
                    chapters=keeper_doc.chapters,
                    raw_chapters=keeper_doc.chapters,
                    total_pages=len(keeper_doc.chapters or []),
                    metadata_=None,
                ).on_conflict_do_nothing(index_elements=['content_hash'])
                await s.execute(stmt)

                # Stamp every member book to the shared hash.
                for book, _doc in members:
                    await s.execute(text(
                        "UPDATE books SET content_hash = :h WHERE id = :i"
                    ), {'h': canonical_content_hash, 'i': book.id})

    if apply:
        async with async_session() as commit_session:
            await commit_session.commit()

    print(f"{'APPLIED' if apply else 'DRY-RUN'}: {merged_groups} groups, "
          f"{merged_books} books would reference shared content")


if __name__ == '__main__':
    apply = '--apply' in sys.argv
    asyncio.run(main(apply))
